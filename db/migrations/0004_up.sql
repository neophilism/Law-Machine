-- LM-046 PARTIAL: durable PostgreSQL job transitions with lease/fencing checks.
-- Apply atomically after migrations 0001–0003. No production queue is enabled.
ALTER TABLE lm_jobs ADD COLUMN max_attempts int NOT NULL DEFAULT 3
 CHECK (max_attempts BETWEEN 1 AND 10);
ALTER TABLE lm_jobs ADD COLUMN fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0);
ALTER TABLE lm_jobs ADD COLUMN worker_id text;
ALTER TABLE lm_jobs ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE lm_jobs ADD COLUMN checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK (jsonb_typeof(checkpoint)='object' AND octet_length(checkpoint::text)<=16384);
ALTER TABLE lm_jobs ADD COLUMN result_digest text
 CHECK (result_digest IS NULL OR result_digest ~ '^[a-f0-9]{64}$');
ALTER TABLE lm_jobs ADD COLUMN last_error_code text
 CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$');
CREATE INDEX lm_jobs_lease_idx ON lm_jobs(org_id,state,available_at,lease_until);

CREATE FUNCTION lm_assert_job_scope(p_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_setting('app.organization_id',true) IS DISTINCT FROM p_org::text
 THEN RAISE EXCEPTION 'LM_JOB_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
END; $$;

CREATE FUNCTION lm_enqueue_job(p_org uuid,p_id uuid,p_document uuid,
  p_kind text,p_idempotency text,p_max_attempts integer)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE existing lm_jobs%ROWTYPE;
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 IF p_kind NOT IN ('source-import','model-compile','release-validate')
   OR length(p_idempotency) NOT BETWEEN 1 AND 128 OR
   p_max_attempts NOT BETWEEN 1 AND 10
 THEN RAISE EXCEPTION 'LM_JOB_INVALID'; END IF;
 INSERT INTO lm_jobs(org_id,id,document_id,kind,idempotency_key,max_attempts)
 VALUES(p_org,p_id,p_document,p_kind,p_idempotency,p_max_attempts)
 ON CONFLICT (org_id,idempotency_key) DO NOTHING;
 SELECT * INTO existing FROM lm_jobs
 WHERE org_id=p_org AND idempotency_key=p_idempotency;
 IF NOT FOUND OR existing.document_id IS DISTINCT FROM p_document OR
    existing.kind IS DISTINCT FROM p_kind OR
    existing.max_attempts IS DISTINCT FROM p_max_attempts
 THEN RAISE EXCEPTION 'LM_JOB_IDEMPOTENCY_CONFLICT'; END IF;
 RETURN existing.id;
END; $$;

CREATE FUNCTION lm_claim_job(p_org uuid,p_worker text,p_lease_seconds integer)
RETURNS TABLE(leased_id uuid,leased_document_id uuid,leased_kind text,
 leased_fence bigint,leased_attempts integer,leased_until timestamptz,
 leased_checkpoint jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 IF p_worker !~ '^[A-Za-z0-9._:-]{1,128}$' OR
    p_lease_seconds NOT BETWEEN 1 AND 60
 THEN RAISE EXCEPTION 'LM_JOB_CLAIM_INVALID'; END IF;
 RETURN QUERY WITH candidate AS (
   SELECT j.org_id,j.id FROM lm_jobs j
    WHERE j.org_id=p_org AND j.attempts<j.max_attempts
      AND ((j.state='queued' AND j.available_at<=clock_timestamp()) OR
           (j.state='running' AND j.lease_until<=clock_timestamp()))
    ORDER BY j.available_at,j.created_at,j.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE lm_jobs AS j
    SET state='running',attempts=j.attempts+1,fence=j.fence+1,
      worker_id=p_worker,lease_until=clock_timestamp()+
        make_interval(secs=>p_lease_seconds)
    FROM candidate c WHERE j.org_id=c.org_id AND j.id=c.id
  RETURNING j.id,j.document_id,j.kind,j.fence,j.attempts,
    j.lease_until,j.checkpoint;
END; $$;

CREATE FUNCTION lm_job_heartbeat(p_org uuid,p_id uuid,p_worker text,
  p_fence bigint,p_lease_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 IF p_lease_seconds NOT BETWEEN 1 AND 60 THEN RETURN false; END IF;
 UPDATE lm_jobs SET lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
 WHERE org_id=p_org AND id=p_id AND state='running'
   AND fence=p_fence AND worker_id=p_worker AND lease_until>clock_timestamp();
 RETURN FOUND;
END; $$;

CREATE FUNCTION lm_job_checkpoint(p_org uuid,p_id uuid,p_worker text,
  p_fence bigint,p_state jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 IF p_state IS NULL OR jsonb_typeof(p_state)<>'object' OR
    octet_length(p_state::text)>16384 THEN RETURN false; END IF;
 UPDATE lm_jobs SET checkpoint=p_state
 WHERE org_id=p_org AND id=p_id AND state='running' AND
   fence=p_fence AND worker_id=p_worker AND lease_until>clock_timestamp();
 RETURN FOUND;
END; $$;

CREATE FUNCTION lm_complete_job(p_org uuid,p_id uuid,p_worker text,
  p_fence bigint,p_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 UPDATE lm_jobs SET state='completed',lease_until=NULL,worker_id=NULL,result_digest=p_digest
 WHERE org_id=p_org AND id=p_id AND state='running' AND
   fence=p_fence AND worker_id=p_worker AND lease_until>clock_timestamp();
 RETURN FOUND;
END; $$;

CREATE FUNCTION lm_fail_job(p_org uuid,p_id uuid,p_worker text,
  p_fence bigint,p_error text,p_retryable boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 IF p_error IS NULL OR p_error !~ '^[A-Z][A-Z0-9_]{0,63}$' OR
    p_retryable IS NULL THEN RETURN false; END IF;
 UPDATE lm_jobs
 SET state=CASE WHEN p_retryable AND attempts<max_attempts THEN 'queued' ELSE 'failed' END,
     lease_until=NULL,worker_id=NULL,last_error_code=p_error,
     available_at=clock_timestamp()+make_interval(secs=>
       LEAST(60,POWER(2,attempts)::integer))
 WHERE org_id=p_org AND id=p_id AND state='running' AND
   fence=p_fence AND worker_id=p_worker AND lease_until>clock_timestamp();
 RETURN FOUND;
END; $$;

CREATE FUNCTION lm_cancel_job(p_org uuid,p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 UPDATE lm_jobs SET state='cancelled',lease_until=NULL,
   worker_id=NULL,fence=fence+1
 WHERE org_id=p_org AND id=p_id AND state IN ('queued','running');
 RETURN FOUND;
END; $$;

CREATE FUNCTION lm_reap_exhausted_jobs(p_org uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE changed bigint;
BEGIN
 PERFORM lm_assert_job_scope(p_org);
 UPDATE lm_jobs SET state='failed',lease_until=NULL,worker_id=NULL,
    last_error_code='LEASE_EXHAUSTED',fence=fence+1
 WHERE org_id=p_org AND state='running' AND attempts>=max_attempts AND
    lease_until<=clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END; $$;
