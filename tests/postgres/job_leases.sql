\set ON_ERROR_STOP on
-- Disposable PostgreSQL only; fixture organizations, no real source data.
CREATE ROLE lm_ci_worker NOLOGIN;
GRANT USAGE ON SCHEMA public TO lm_ci_worker;
GRANT SELECT,INSERT,UPDATE ON lm_jobs TO lm_ci_worker;
GRANT EXECUTE ON FUNCTION lm_assert_job_scope(uuid),
 lm_enqueue_job(uuid,uuid,uuid,text,text,integer),
 lm_claim_job(uuid,text,integer),
 lm_job_heartbeat(uuid,uuid,text,bigint,integer),
 lm_job_checkpoint(uuid,uuid,text,bigint,jsonb),
 lm_complete_job(uuid,uuid,text,bigint,text),
 lm_fail_job(uuid,uuid,text,bigint,text,boolean),
 lm_cancel_job(uuid,uuid),lm_reap_exhausted_jobs(uuid) TO lm_ci_worker;
SET ROLE lm_ci_worker;
SELECT set_config('app.organization_id','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE job uuid;fence1 bigint;fence2 bigint;
BEGIN
 job:=lm_enqueue_job('11111111-1111-4111-8111-111111111111',
  '55555555-5555-4555-8555-555555555555',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','source-import','ci-key-a',2);
 IF job<> '55555555-5555-4555-8555-555555555555'::uuid
 THEN RAISE EXCEPTION 'ENQUEUE_FAILED';END IF;
 IF lm_enqueue_job('11111111-1111-4111-8111-111111111111',
  '55555555-5555-4555-8555-555555555556',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','source-import','ci-key-a',2) <> job
 THEN RAISE EXCEPTION 'DUPLICATE_NOT_IDEMPOTENT';END IF;
 BEGIN
  PERFORM lm_enqueue_job('11111111-1111-4111-8111-111111111111',
   '55555555-5555-4555-8555-555555555557',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc','model-compile','ci-key-a',2);
  RAISE EXCEPTION 'CONFLICT_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'LM_JOB_IDEMPOTENCY_CONFLICT' THEN RAISE;END IF;
 END;
 SELECT leased_fence INTO fence1 FROM lm_claim_job(
   '11111111-1111-4111-8111-111111111111','worker-a',1);
 IF fence1<>1 THEN RAISE EXCEPTION 'CLAIM_FENCE_INVALID';END IF;
 IF EXISTS (SELECT 1 FROM lm_claim_job(
    '11111111-1111-4111-8111-111111111111','worker-b',1))
 THEN RAISE EXCEPTION 'DUPLICATE_LEASE';END IF;
 IF NOT lm_job_checkpoint('11111111-1111-4111-8111-111111111111',
   job,'worker-a',fence1,'{"step":1}'::jsonb)
 THEN RAISE EXCEPTION 'CHECKPOINT_REJECTED';END IF;
 IF lm_job_checkpoint('11111111-1111-4111-8111-111111111111',
   job,'other-worker',fence1,'{"unsafe":true}'::jsonb)
 THEN RAISE EXCEPTION 'WRONG_WORKER_CHECKPOINT';END IF;
 -- Simulate an orphaned crashed worker; lease is expired by trusted CI role.
 UPDATE lm_jobs SET lease_until=clock_timestamp()-interval '1 second'
 WHERE org_id='11111111-1111-4111-8111-111111111111' AND id=job;
 SELECT leased_fence INTO fence2 FROM lm_claim_job(
   '11111111-1111-4111-8111-111111111111','worker-b',1);
 IF fence2<=fence1 THEN RAISE EXCEPTION 'FENCING_TOKEN_NOT_ADVANCED';END IF;
 IF lm_complete_job('11111111-1111-4111-8111-111111111111',
   job,'worker-a',fence1,repeat('a',64))
 THEN RAISE EXCEPTION 'STALE_WORKER_COMMITTED';END IF;
 IF NOT lm_complete_job('11111111-1111-4111-8111-111111111111',
   job,'worker-b',fence2,repeat('b',64))
 THEN RAISE EXCEPTION 'RECOVERED_WORKER_FAILED';END IF;
 IF lm_complete_job('11111111-1111-4111-8111-111111111111',
   job,'worker-b',fence2,repeat('b',64))
 THEN RAISE EXCEPTION 'DUPLICATE_COMPLETION';END IF;
END $$;
DO $$
DECLARE id uuid := '66666666-6666-4666-8666-666666666666';f bigint;
BEGIN
 PERFORM lm_enqueue_job('11111111-1111-4111-8111-111111111111',
  id,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','model-compile','ci-key-b',1);
 SELECT leased_fence INTO f FROM lm_claim_job(
   '11111111-1111-4111-8111-111111111111','worker-c',1);
 IF f IS NULL THEN RAISE EXCEPTION 'SECOND_JOB_NOT_CLAIMED';END IF;
 UPDATE lm_jobs SET lease_until=clock_timestamp()-interval '1 second'
 WHERE org_id='11111111-1111-4111-8111-111111111111' AND id=id;
 IF lm_reap_exhausted_jobs('11111111-1111-4111-8111-111111111111')<>1
 THEN RAISE EXCEPTION 'EXPIRED_DEAD_LETTER_MISSING';END IF;
END $$;
-- Wrong tenant context must never be able to claim other organization jobs.
DO $$ BEGIN
 BEGIN
  PERFORM lm_claim_job('22222222-2222-4222-8222-222222222222','worker-z',1);
  RAISE EXCEPTION 'CROSS_TENANT_CLAIM';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'LM_JOB_SCOPE_DENIED' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
DROP OWNED BY lm_ci_worker;
DROP ROLE lm_ci_worker;
