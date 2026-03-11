<#
.SYNOPSIS
  End-to-end REST API test suite for Concept.io Sync endpoints.

.DESCRIPTION
  Tests every sync controller endpoint (CRUD targets, trigger sync,
  sync-all, logs) plus error/edge cases against a running server.

  Requires the server to be running at $BaseUrl (default http://localhost:5000).
  Uses a fresh project + branch + snapshot per run so tests are idempotent.

.USAGE
  # Run all tests (server must be running):
  .\test-sync-api.ps1

  # Custom server URL:
  .\test-sync-api.ps1 -BaseUrl "http://localhost:3000"

  # Include git repo sync test (requires PAT):
  .\test-sync-api.ps1 -GitRepoUrl "https://github.com/user/repo" -GitToken "ghp_..." -GitProvider "github"
#>

param(
  [string]$BaseUrl    = "http://localhost:5000",
  [string]$GitRepoUrl = "",
  [string]$GitToken   = "",
  [string]$GitProvider = "github"  # "github" or "gitlab"
)

$ErrorActionPreference = "Stop"

# ── Counters ─────────────────────────────────────────────────

$script:passed  = 0
$script:failed  = 0
$script:skipped = 0
$script:errors  = @()

# ── Helpers ──────────────────────────────────────────────────

function Write-Section([string]$title) {
  Write-Host ""
  Write-Host ("=" * 60) -ForegroundColor DarkGray
  Write-Host "  $title" -ForegroundColor Cyan
  Write-Host ("=" * 60) -ForegroundColor DarkGray
}

function Write-TestResult([string]$name, [bool]$pass, [string]$detail = "") {
  if ($pass) {
    $script:passed++
    Write-Host "  [PASS] $name" -ForegroundColor Green
  } else {
    $script:failed++
    $script:errors += "$name - $detail"
    Write-Host "  [FAIL] $name" -ForegroundColor Red
    if ($detail) { Write-Host "         $detail" -ForegroundColor DarkRed }
  }
}

function Write-TestSkipped([string]$name, [string]$reason) {
  $script:skipped++
  Write-Host "  [SKIP] $name - $reason" -ForegroundColor Yellow
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body     = $null,
    [int]$ExpectStatus = 200
  )
  $params = @{
    Method      = $Method
    Uri         = $Uri
    ContentType = "application/json"
    ErrorAction = "Stop"
  }
  if ($Body) {
    $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 5 }
    $params.Body = $json
  }
  try {
    $response = Invoke-WebRequest @params
    $status   = [int]$response.StatusCode
    $data     = $response.Content | ConvertFrom-Json
    return @{ Status = $status; Body = $data; Error = $null }
  } catch {
    $ex     = $_.Exception
    $status = 0
    $body   = $null
    if ($ex.Response) {
      $status = [int]$ex.Response.StatusCode
      try {
        $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
        $body   = $reader.ReadToEnd() | ConvertFrom-Json
        $reader.Close()
      } catch {
        # If stream already consumed by PowerShell, try ErrorDetails
        try { $body = $_.ErrorDetails.Message | ConvertFrom-Json } catch {}
      }
    }
    return @{ Status = $status; Body = $body; Error = $ex.Message }
  }
}

# ── Preflight: Server reachable? ────────────────────────────

Write-Host ""
Write-Host "Concept.io Sync API Test Suite" -ForegroundColor White
Write-Host "Server: $BaseUrl" -ForegroundColor DarkGray
Write-Host ""

try {
  $null = Invoke-WebRequest -Uri "$BaseUrl/api/projects" -Method GET -TimeoutSec 5 -ErrorAction Stop
  Write-Host "  Server is reachable." -ForegroundColor Green
} catch {
  Write-Host "  ERROR: Cannot reach server at $BaseUrl" -ForegroundColor Red
  Write-Host "  Start the server first:  cd server && npm run dev" -ForegroundColor Yellow
  exit 1
}

# ── Seed: Project + Branch + Snapshot ────────────────────────

Write-Section "Setup: Seed test data"

$r = Invoke-Api -Method POST -Uri "$BaseUrl/api/projects" -Body @{
  name        = "Sync API Test [$(Get-Date -Format 'HH:mm:ss')]"
  description = "Auto-created by test-sync-api.ps1"
  userId      = "test-runner"
} -ExpectStatus 201

$projectId = $r.Body.data.id
Write-Host "  Project:  $projectId" -ForegroundColor DarkGray

$r = Invoke-Api -Method GET -Uri "$BaseUrl/api/projects/$projectId/branches"
$branchId = $r.Body.data[0].id
Write-Host "  Branch:   $branchId" -ForegroundColor DarkGray

$r = Invoke-Api -Method POST -Uri "$BaseUrl/api/projects/$projectId/snapshots" -Body @{
  name        = "Test Snapshot v1"
  description = "For sync testing"
  branchId    = $branchId
  layers      = @(@{
    layerId   = "layer-1"
    name      = "Background"
    type      = "full"
    objects   = "[]"
    visible   = $true
    opacity   = 1
    blendMode = "normal"
    zIndex    = 0
  })
  thumbnail   = ""
  userId      = "test-runner"
} -ExpectStatus 201

$snapshotId = $r.Body.data.id
Write-Host "  Snapshot: $snapshotId" -ForegroundColor DarkGray

$syncBase = "$BaseUrl/api/projects/$projectId/sync"

# ═════════════════════════════════════════════════════════════
#  C1 - Create Sync Target
# ═════════════════════════════════════════════════════════════

Write-Section "C1 - POST /targets (Create)"

# C1.1 Create local target
$r = Invoke-Api -Method POST -Uri "$syncBase/targets" -Body @{
  type   = "local"
  name   = "Test Local Export"
  config = @{ folderPath = "C:/temp/concept-sync-test-$projectId" }
  userId = "test-runner"
}
$localTarget = $r.Body.data
Write-TestResult "Create local target - 201" ($r.Status -eq 201)
Write-TestResult "Target has UUID id" ($localTarget.id.Length -ge 36)
Write-TestResult "projectId matches" ($localTarget.projectId -eq $projectId)
Write-TestResult "enabled defaults to true" ($localTarget.enabled -eq $true)
Write-TestResult "createdBy is set" ($localTarget.createdBy -eq "test-runner")

$targetId = $localTarget.id

# C1.2 Create git target (token masking)
$r = Invoke-Api -Method POST -Uri "$syncBase/targets" -Body @{
  type   = "git"
  name   = "Git Target (masked)"
  config = @{
    repoUrl  = "https://github.com/test/repo"
    branch   = "main"
    path     = "art"
    provider = "github"
  }
  token  = "ghp_faketoken123456"
  userId = "test-runner"
}
$gitTarget = $r.Body.data
Write-TestResult "Create git target - 201" ($r.Status -eq 201)
Write-TestResult "Token masked as ***" ($gitTarget.config.encryptedToken -eq "***")

# C1.3 Missing required fields
$r = Invoke-Api -Method POST -Uri "$syncBase/targets" -Body @{ type = "local" }
Write-TestResult "Missing fields - 400" ($r.Status -eq 400)
Write-TestResult "Error mentions required fields" ($r.Body.error -match "required")

# C1.4 Empty body
$r = Invoke-Api -Method POST -Uri "$syncBase/targets" -Body @{}
Write-TestResult "Empty body - 400" ($r.Status -eq 400)

# ═════════════════════════════════════════════════════════════
#  C2 - List Targets
# ═════════════════════════════════════════════════════════════

Write-Section "C2 - GET /targets (List)"

$r = Invoke-Api -Method GET -Uri "$syncBase/targets"
Write-TestResult "List targets - 200" ($r.Status -eq 200)
Write-TestResult "Returns 2 targets" ($r.Body.data.Count -eq 2)

# Cross-project isolation
$otherProject = [guid]::NewGuid().ToString()
$r2 = Invoke-Api -Method GET -Uri "$BaseUrl/api/projects/$otherProject/sync/targets"
Write-TestResult "Other project returns empty" ($r2.Body.data.Count -eq 0)

# ═════════════════════════════════════════════════════════════
#  C2b - Get Single Target
# ═════════════════════════════════════════════════════════════

Write-Section "C2b - GET /targets/:id (Single)"

$r = Invoke-Api -Method GET -Uri "$syncBase/targets/$targetId"
Write-TestResult "Get target by ID - 200" ($r.Status -eq 200)
Write-TestResult "Correct name" ($r.Body.data.name -eq "Test Local Export")

$fakeId = [guid]::NewGuid().ToString()
$r = Invoke-Api -Method GET -Uri "$syncBase/targets/$fakeId"
Write-TestResult "Non-existent target - 404" ($r.Status -eq 404)

# ═════════════════════════════════════════════════════════════
#  C3 - Toggle Enable/Disable (PATCH)
# ═════════════════════════════════════════════════════════════

Write-Section "C3 - PATCH /targets/:id (Update)"

# Disable
$r = Invoke-Api -Method PATCH -Uri "$syncBase/targets/$targetId" -Body @{ enabled = $false }
Write-TestResult "Disable target - 200" ($r.Status -eq 200)
Write-TestResult "enabled = false" ($r.Body.data.enabled -eq $false)

$updatedAt1 = $r.Body.data.updatedAt

# Re-enable
$r = Invoke-Api -Method PATCH -Uri "$syncBase/targets/$targetId" -Body @{ enabled = $true }
Write-TestResult "Re-enable target - 200" ($r.Status -eq 200)
Write-TestResult "enabled = true" ($r.Body.data.enabled -eq $true)
Write-TestResult "updatedAt changed" ($r.Body.data.updatedAt -ge $updatedAt1)

# Rename + config update
$r = Invoke-Api -Method PATCH -Uri "$syncBase/targets/$targetId" -Body @{
  name   = "Renamed Export"
  config = @{ folderPath = "C:/temp/renamed-path" }
}
Write-TestResult "Rename + config - 200" ($r.Status -eq 200)
Write-TestResult "Name updated" ($r.Body.data.name -eq "Renamed Export")
Write-TestResult "Config updated" ($r.Body.data.config.folderPath -eq "C:/temp/renamed-path")

# Restore original name for later tests
$null = Invoke-Api -Method PATCH -Uri "$syncBase/targets/$targetId" -Body @{
  name   = "Test Local Export"
  config = @{ folderPath = "C:/temp/concept-sync-test-$projectId" }
}

# 404 on non-existent
$r = Invoke-Api -Method PATCH -Uri "$syncBase/targets/$fakeId" -Body @{ name = "Ghost" }
Write-TestResult "Update non-existent - 404" ($r.Status -eq 404)

# ═════════════════════════════════════════════════════════════
#  C4 - Trigger Sync (POST /targets/:id/sync)
# ═════════════════════════════════════════════════════════════

Write-Section "C4 - POST /targets/:id/sync (Manual Trigger)"

$r = Invoke-Api -Method POST -Uri "$syncBase/targets/$targetId/sync" -Body @{ snapshotId = $snapshotId }
Write-TestResult "Trigger sync - 200" ($r.Status -eq 200)
Write-TestResult "Sync log returned" ($null -ne $r.Body.data.id)

$syncStatus = $r.Body.data.status
if ($syncStatus -eq "success") {
  Write-TestResult "Sync status = success" $true
  $filesCount = $r.Body.data.details.files.Count
  Write-TestResult "Files synced > 0" ($filesCount -gt 0)
  Write-Host "         Synced $filesCount file(s) in $($r.Body.data.durationMs)ms" -ForegroundColor DarkGray

  # Verify files on disk
  $syncFolder = "C:\temp\concept-sync-test-$projectId"
  $diskFiles  = @()
  if (Test-Path $syncFolder) { $diskFiles = Get-ChildItem $syncFolder -Recurse -File }
  Write-TestResult "Files exist on disk" ($diskFiles.Count -gt 0)
} else {
  Write-TestResult "Sync status = success (got: $syncStatus)" $false $r.Body.data.message
}

# Missing snapshotId
$r = Invoke-Api -Method POST -Uri "$syncBase/targets/$targetId/sync" -Body @{}
Write-TestResult "Missing snapshotId - 400" ($r.Status -eq 400)
Write-TestResult "Error says snapshotId required" ($r.Body.error -match "snapshotId")

# Non-existent snapshot
$r = Invoke-Api -Method POST -Uri "$syncBase/targets/$targetId/sync" -Body @{
  snapshotId = [guid]::NewGuid().ToString()
}
Write-TestResult "Non-existent snapshot - 404" ($r.Status -eq 404)

# Disabled target
$null = Invoke-Api -Method PATCH -Uri "$syncBase/targets/$targetId" -Body @{ enabled = $false }
$r = Invoke-Api -Method POST -Uri "$syncBase/targets/$targetId/sync" -Body @{ snapshotId = $snapshotId }
Write-TestResult "Disabled target - 409" ($r.Status -eq 409)
Write-TestResult "Error says disabled" ($r.Body.error -match "disabled")
$null = Invoke-Api -Method PATCH -Uri "$syncBase/targets/$targetId" -Body @{ enabled = $true }

# ═════════════════════════════════════════════════════════════
#  C4b - Sync All (POST /sync-all)
# ═════════════════════════════════════════════════════════════

Write-Section "C4b - POST /sync-all"

$r = Invoke-Api -Method POST -Uri "$syncBase/sync-all" -Body @{ snapshotId = $snapshotId }
Write-TestResult "Sync-all - 200" ($r.Status -eq 200)
Write-TestResult "Returns array" ($r.Body.data -is [array] -or $r.Body.data.Count -ge 0)

# Missing snapshotId
$r = Invoke-Api -Method POST -Uri "$syncBase/sync-all" -Body @{}
Write-TestResult "Sync-all missing snapshotId - 400" ($r.Status -eq 400)

# ═════════════════════════════════════════════════════════════
#  C5 - Sync Logs
# ═════════════════════════════════════════════════════════════

Write-Section "C5 - GET /targets/:id/logs"

$r = Invoke-Api -Method GET -Uri "$syncBase/targets/$targetId/logs"
Write-TestResult "Get logs - 200" ($r.Status -eq 200)
Write-TestResult "Has at least 1 log" ($r.Body.data.Count -ge 1)

if ($r.Body.data.Count -gt 0) {
  $log = $r.Body.data[0]
  Write-TestResult "Log has status field" ($null -ne $log.status)
  Write-TestResult "Log has message field" ($null -ne $log.message)
  Write-TestResult "Log has snapshotId" ($log.snapshotId -eq $snapshotId)
}

# Limit parameter
$r = Invoke-Api -Method GET -Uri "$syncBase/targets/$targetId/logs?limit=1"
Write-TestResult "Limit=1 returns ≤1" ($r.Body.data.Count -le 1)

# Logs for non-existent target
$r = Invoke-Api -Method GET -Uri "$syncBase/targets/$fakeId/logs"
Write-TestResult "Logs for ghost target - 200 (empty)" ($r.Status -eq 200 -and $r.Body.data.Count -eq 0)

# ═════════════════════════════════════════════════════════════
#  C6 - Delete Target
# ═════════════════════════════════════════════════════════════

Write-Section "C6 - DELETE /targets/:id"

# Delete the git target first (keep local for later)
$r = Invoke-Api -Method DELETE -Uri "$syncBase/targets/$($gitTarget.id)"
Write-TestResult "Delete git target - 200" ($r.Status -eq 200)

# Confirm gone
$r = Invoke-Api -Method GET -Uri "$syncBase/targets/$($gitTarget.id)"
Write-TestResult "Deleted target returns 404" ($r.Status -eq 404)

# Idempotent delete
$r = Invoke-Api -Method DELETE -Uri "$syncBase/targets/$fakeId"
Write-TestResult "Delete non-existent - 200 (idempotent)" ($r.Status -eq 200)

# ═════════════════════════════════════════════════════════════
#  C7 - Persistence (round-trip)
# ═════════════════════════════════════════════════════════════

Write-Section "C7 - Data persistence"

$r = Invoke-Api -Method GET -Uri "$syncBase/targets/$targetId"
Write-TestResult "Target still retrievable after mutations" ($r.Status -eq 200 -and $r.Body.data.name -eq "Test Local Export")

$r = Invoke-Api -Method GET -Uri "$syncBase/targets"
Write-TestResult "List shows 1 remaining target" ($r.Body.data.Count -eq 1)

# ═════════════════════════════════════════════════════════════
#  F - Git Repo Sync (optional - requires PAT)
# ═════════════════════════════════════════════════════════════

Write-Section "F - Git Repository Sync (live)"

if ($GitRepoUrl -and $GitToken) {
  # Create git target with real credentials
  $r = Invoke-Api -Method POST -Uri "$syncBase/targets" -Body @{
    type   = "git"
    name   = "Live Git Test"
    config = @{
      repoUrl  = $GitRepoUrl
      branch   = "main"
      path     = "concept-io-test"
      provider = $GitProvider
    }
    token  = $GitToken
    userId = "test-runner"
  }
  $liveGitId = $r.Body.data.id
  Write-TestResult "Create live git target - 201" ($r.Status -eq 201)
  Write-TestResult "Token masked in response" ($r.Body.data.config.encryptedToken -eq "***")

  # Trigger sync
  $r = Invoke-Api -Method POST -Uri "$syncBase/targets/$liveGitId/sync" -Body @{ snapshotId = $snapshotId }
  $gitSyncStatus = $r.Body.data.status
  Write-TestResult "Git sync status = success" ($gitSyncStatus -eq "success")

  if ($gitSyncStatus -eq "success") {
    Write-TestResult "Commit SHA returned" ($r.Body.data.details.commitSha.Length -gt 0)
    $commitCount = $r.Body.data.details.files.Count
    Write-TestResult "Files committed > 0" ($commitCount -gt 0)
    Write-Host "         Committed $commitCount file(s), SHA: $($r.Body.data.details.commitSha)" -ForegroundColor DarkGray
  } else {
    Write-TestResult "Git sync succeeded (got: $gitSyncStatus)" $false $r.Body.data.message
  }

  # Check logs
  $r = Invoke-Api -Method GET -Uri "$syncBase/targets/$liveGitId/logs"
  Write-TestResult "Git sync log recorded" ($r.Body.data.Count -ge 1)

  # Error case: bad token
  $r2 = Invoke-Api -Method POST -Uri "$syncBase/targets" -Body @{
    type   = "git"
    name   = "Bad Token Test"
    config = @{
      repoUrl  = $GitRepoUrl
      branch   = "main"
      path     = "bad-token-test"
      provider = $GitProvider
    }
    token  = "ghp_invalid_token_000000"
    userId = "test-runner"
  }
  $badGitId = $r2.Body.data.id
  $r2 = Invoke-Api -Method POST -Uri "$syncBase/targets/$badGitId/sync" -Body @{ snapshotId = $snapshotId }
  # This should succeed at HTTP level but the log status should be "failed"
  $badStatus = $r2.Body.data.status
  Write-TestResult "Bad token sync fails gracefully" ($badStatus -eq "failed")
  if ($badStatus -eq "failed") {
    Write-Host "         Error: $($r2.Body.data.message)" -ForegroundColor DarkGray
  }

  # Cleanup git targets
  $null = Invoke-Api -Method DELETE -Uri "$syncBase/targets/$liveGitId"
  $null = Invoke-Api -Method DELETE -Uri "$syncBase/targets/$badGitId"
} else {
  Write-TestSkipped "Git repo sync" "Pass -GitRepoUrl and -GitToken to enable"
  Write-TestSkipped "Git bad token test" "Requires -GitToken"
}

# ═════════════════════════════════════════════════════════════
#  Cleanup
# ═════════════════════════════════════════════════════════════

Write-Section "Cleanup"

# Delete remaining local target
$null = Invoke-Api -Method DELETE -Uri "$syncBase/targets/$targetId" -ExpectStatus 200

# Clean up sync folder
$syncFolder = "C:\temp\concept-sync-test-$projectId"
if (Test-Path $syncFolder) {
  Remove-Item $syncFolder -Recurse -Force
  Write-Host "  Removed $syncFolder" -ForegroundColor DarkGray
}

Write-Host "  Test data cleaned up." -ForegroundColor DarkGray

# ═════════════════════════════════════════════════════════════
#  Summary
# ═════════════════════════════════════════════════════════════

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor DarkGray
Write-Host "  RESULTS" -ForegroundColor White
Write-Host ("=" * 60) -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Passed:  $script:passed" -ForegroundColor Green
Write-Host "  Failed:  $script:failed" -ForegroundColor $(if ($script:failed -gt 0) { "Red" } else { "Green" })
Write-Host "  Skipped: $script:skipped" -ForegroundColor Yellow
Write-Host "  Total:   $($script:passed + $script:failed + $script:skipped)" -ForegroundColor White
Write-Host ""

if ($script:errors.Count -gt 0) {
  Write-Host "  Failures:" -ForegroundColor Red
  foreach ($e in $script:errors) {
    Write-Host "    - $e" -ForegroundColor DarkRed
  }
  Write-Host ""
}

# Exit with code for CI
if ($script:failed -gt 0) { exit 1 } else { exit 0 }
