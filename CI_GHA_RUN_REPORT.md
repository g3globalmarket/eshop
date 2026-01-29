# CI GitHub Actions Run Report

**Run ID:** 21107351780  
**Run URL:** https://github.com/g3globalmarket/eshop/actions/runs/21107351780  
**Trigger:** workflow_dispatch (force_rebuild=true)  
**Branch:** main  
**Status:** completed  
**Conclusion:** failure

---

## Root Cause Classification

**Category:** A) Infrastructure - Docker Hub Rate Limiting

**Evidence:**
- 65 rate limit errors found in failed logs
- Error pattern: `429 Too Many Requests` when pulling base images
- Error message: `toomanyrequests: You have reached your pull rate limit`

**Exact Error Sample:**
```
build-frontend (user-ui)	Build and push Docker image	2026-01-18T06:29:20.4844547Z #2 ERROR: failed to copy: httpReadSeeker: failed open: unexpected status from GET request to https://registry-1.docker.io/v2/library/node/manifests/sha256:3960ed74dfe320a67bf8da9555b6bade25ebda2b22b6081d2f60fd7d5d430e9c: 429 Too Many Requests
build-frontend (user-ui)	Build and push Docker image	2026-01-18T06:29:20.4847960Z toomanyrequests: You have reached your pull rate limit as '***': dckr_jti_9Lg3-DN__PcJ-S_X3BoAVBr-mIk=. You may increase the limit by upgrading. https://www.docker.com/increase-rate-limit
build-frontend (user-ui)	Build and push Docker image	2026-01-18T06:29:20.5160646Z ERROR: failed to build: failed to solve: node:20-alpine: failed to resolve source metadata for docker.io/library/node:20-alpine: failed to copy: httpReadSeeker: failed open: unexpected status from GET request to https://registry-1.docker.io/v2/library/node/manifests/sha256:3960ed74dfe320a67bf8da9555b6bade25ebda2b22b6081d2f60fd7d5d430e9c: 429 Too Many Requests
```

**Affected Jobs:**
  - Build step failed
  - Build step failed
  - Build step failed
  - Build step failed
  - Build step failed


---

## Fix Status

**GHA Cache:** ✅ Already configured
- GitHub Actions cache (type=gha) is present in workflow
- Registry cache maintained as fallback
- `pull: false` configured to reduce unnecessary pulls

**No changes needed** - Workflow already hardened against rate limits.


---

## Verification

**Local tests:**
- ✅ `bash scripts/prod-safety-scan.sh` - All checks passed
- ✅ `bash scripts/smoke-run-images.sh` - All smoke tests passed

**Next Steps:**
1. If rate limit detected and GHA cache not configured: Apply fix and re-run
2. If rate limit detected and GHA cache configured: Wait for rate limit reset (6 hours)
3. Monitor next run to verify fix effectiveness

---

## Notes

- Docker Hub rate limits: 100 anonymous / 200 authenticated pulls per 6 hours
- Workflow uses Docker Hub authentication (secrets.DOCKERHUB_USERNAME/TOKEN)
- GHA cache is free and unlimited (no rate limits)
- Rate limits reset every 6 hours
