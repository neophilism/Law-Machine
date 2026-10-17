-- TEST-ONLY destructive inverse, not a production rollback.
DROP FUNCTION lm_reap_exhausted_jobs(uuid);
DROP FUNCTION lm_cancel_job(uuid,uuid);
DROP FUNCTION lm_fail_job(uuid,uuid,text,bigint,text,boolean);
DROP FUNCTION lm_complete_job(uuid,uuid,text,bigint,text);
DROP FUNCTION lm_job_checkpoint(uuid,uuid,text,bigint,jsonb);
DROP FUNCTION lm_job_heartbeat(uuid,uuid,text,bigint,integer);
DROP FUNCTION lm_claim_job(uuid,text,integer);
DROP FUNCTION lm_enqueue_job(uuid,uuid,uuid,text,text,integer);
DROP FUNCTION lm_assert_job_scope(uuid);
DROP INDEX lm_jobs_lease_idx;
ALTER TABLE lm_jobs DROP COLUMN last_error_code,DROP COLUMN result_digest,
 DROP COLUMN checkpoint,DROP COLUMN available_at,DROP COLUMN worker_id,
 DROP COLUMN fence,DROP COLUMN max_attempts;
