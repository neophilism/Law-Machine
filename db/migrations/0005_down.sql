-- Disposable CI/staging only; destructive inverse.
DROP FUNCTION lm_consume_oidc_pending(text,text);
DROP TABLE lm_oidc_pending_logins;
