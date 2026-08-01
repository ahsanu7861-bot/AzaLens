#!/bin/bash

set -Eeuo pipefail

# ==================================================
# AzaLens — Three-Copy Backup Verifier
# ==================================================
#
# Copies maintained:
# 1. Local Git repository
# 2. GitHub origin branch
# 3. Compressed source archive + SHA-256 checksum in
#    the Google Drive-synced backups folder
#
# This script NEVER commits and NEVER pushes. It
# verifies that copies 1 and 2 already match, then
# creates and verifies copy 3. If the working tree is
# dirty or the branch is not pushed, it stops and
# tells you what to do. Committing and pushing stay
# deliberate acts.
#
# Archives are built from the committed Git snapshot,
# so untracked files, .env files, node_modules, logs
# and temporary files are never included.
# ==================================================

PROJECT_DIR="/Users/apple/AzaLens"

BACKUP_DIR="/Users/apple/Library/CloudStorage/GoogleDrive-ahsanu7861@gmail.com/My Drive/Azalens Backups"

LOG_DIR="/Users/apple/Library/Logs"
LOG_FILE="$LOG_DIR/AzaLens-backup.log"

DATE_STAMP="$(date '+%Y-%m-%d')"

mkdir -p "$LOG_DIR"

# Display output in Terminal while also saving it.
exec > >(tee -a "$LOG_FILE") 2>&1

echo ""
echo "=================================================="
echo "AzaLens backup started"
echo "Time: $(date)"
echo "=================================================="

# ==================================================
# 1. Verify project and tools
# ==================================================

if [ ! -d "$PROJECT_DIR" ]; then
    echo "ERROR: Project directory not found: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

if [ ! -d ".git" ]; then
    echo "ERROR: $PROJECT_DIR is not a Git repository."
    exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
    echo "ERROR: GitHub remote 'origin' is not configured."
    exit 1
fi

for REQUIRED_TOOL in zip unzip shasum; do
    if ! command -v "$REQUIRED_TOOL" >/dev/null 2>&1; then
        echo "ERROR: Required tool '$REQUIRED_TOOL' is not available."
        exit 1
    fi
done

if [ ! -d "$BACKUP_DIR" ]; then
    echo "ERROR: Google Drive backup folder not found:"
    echo "  $BACKUP_DIR"
    echo ""
    echo "Check that Google Drive is running and synced."
    exit 1
fi

BRANCH="$(git branch --show-current)"

if [ -z "$BRANCH" ]; then
    echo "ERROR: Git is not currently on a normal branch."
    exit 1
fi

echo "Project: $PROJECT_DIR"
echo "Branch: $BRANCH"

# ==================================================
# 2. Security checks
# ==================================================
#
# .env.example is the committed template with blank
# values. It is excluded by name from these checks;
# every other .env-shaped file stops the backup.

echo "Running security checks..."

TRACKED_ENV_FILES="$(
    git ls-files |
    grep -E '(^|/)\.env($|\.)' |
    grep -v -E '(^|/)\.env\.example$' ||
    true
)"

if [ -n "$TRACKED_ENV_FILES" ]; then
    echo "ERROR: Environment or secret files are tracked by Git:"
    echo "$TRACKED_ENV_FILES"
    echo ""
    echo "Backup stopped to protect API keys."
    exit 1
fi

TRACKED_KEY_NAMES="$(
    git ls-files |
    grep -Ei '(API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY)' ||
    true
)"

if [ -n "$TRACKED_KEY_NAMES" ]; then
    echo "ERROR: Suspicious secret-related filenames are tracked by Git:"
    echo "$TRACKED_KEY_NAMES"
    echo ""
    echo "Backup stopped for manual inspection."
    exit 1
fi

# Confirm real secret files are ignored.
for SECRET_PATH in \
    ".env" \
    "backend/.env" \
    "frontend/.env"
do
    if [ -e "$SECRET_PATH" ]; then
        if ! git check-ignore "$SECRET_PATH" >/dev/null 2>&1; then
            echo "ERROR: $SECRET_PATH exists but is not ignored by Git."
            exit 1
        fi
    fi
done

echo "Security checks passed."

# ==================================================
# 3. Verify copy 1 — local Git is clean
# ==================================================
#
# This script does not commit. A dirty tree means
# there is work the archive would silently omit.

echo "Checking the working tree..."

if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: The working tree has uncommitted changes."
    echo ""
    git status --short
    echo ""
    echo "The archive is built from the committed snapshot,"
    echo "so these changes would NOT be backed up."
    echo ""
    echo "Commit them yourself, then run this script again."
    exit 1
fi

LOCAL_COMMIT="$(git rev-parse HEAD)"
SHORT_COMMIT="$(git rev-parse --short=7 HEAD)"

echo "Working tree is clean at $SHORT_COMMIT."

# ==================================================
# 4. Verify copy 2 — GitHub has this commit
# ==================================================
#
# This script does not push. It only confirms that a
# push already happened.

echo "Fetching GitHub state for verification..."

git fetch origin "$BRANCH" >/dev/null 2>&1 || {
    echo "ERROR: Could not fetch origin/$BRANCH."
    echo "Check your network connection, or push the branch first."
    exit 1
}

REMOTE_COMMIT="$(git rev-parse "origin/$BRANCH" 2>/dev/null || true)"

if [ -z "$REMOTE_COMMIT" ]; then
    echo "ERROR: Branch '$BRANCH' does not exist on GitHub."
    echo ""
    echo "Only two of the three copies exist. Push it yourself first:"
    echo "  git push -u origin $BRANCH"
    exit 1
fi

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "ERROR: Local Git and GitHub do not match."
    echo "Local:  $LOCAL_COMMIT"
    echo "Remote: $REMOTE_COMMIT"
    echo ""
    echo "This script never pushes. Resolve it yourself, then re-run."
    exit 1
fi

echo "Local Git and GitHub are synchronized."

# ==================================================
# 5. Create copy 3 — the archive
# ==================================================

ARCHIVE_NAME="AzaLens-${DATE_STAMP}-${SHORT_COMMIT}.zip"
CHECKSUM_NAME="AzaLens-${DATE_STAMP}-${SHORT_COMMIT}.sha256"

ARCHIVE_PATH="$BACKUP_DIR/$ARCHIVE_NAME"
CHECKSUM_PATH="$BACKUP_DIR/$CHECKSUM_NAME"

# The same date and commit means the same snapshot.
# Verify what is already there instead of overwriting it.
if [ -f "$ARCHIVE_PATH" ] && [ -f "$CHECKSUM_PATH" ]; then
    echo "An archive for $DATE_STAMP at $SHORT_COMMIT already exists."
    echo "Verifying it instead of overwriting..."

    if (cd "$BACKUP_DIR" && shasum -a 256 -c "$CHECKSUM_NAME"); then
        echo ""
        echo "=================================================="
        echo "BACKUP ALREADY COMPLETE AND VERIFIED"
        echo "=================================================="
        echo "Local Git commit: $LOCAL_COMMIT"
        echo "GitHub branch: origin/$BRANCH"
        echo "Archive: $ARCHIVE_PATH"
        echo "Completed: $(date)"
        echo "=================================================="
        exit 0
    fi

    echo "ERROR: The existing archive failed its checksum."
    echo "It may be corrupted. Move it aside and re-run."
    exit 1
fi

echo "Creating clean compressed source archive..."

# Build in a temporary location so a failure never
# leaves a partial file in the Drive folder.
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGING_DIR"' EXIT

STAGED_ARCHIVE="$STAGING_DIR/$ARCHIVE_NAME"

git archive \
    --format=zip \
    --prefix="AzaLens-${DATE_STAMP}/" \
    --output="$STAGED_ARCHIVE" \
    HEAD

if [ ! -s "$STAGED_ARCHIVE" ]; then
    echo "ERROR: Backup archive was not created, or is empty."
    exit 1
fi

# ==================================================
# 6. Verify the archive before uploading it
# ==================================================

echo "Testing archive integrity..."

if ! unzip -t "$STAGED_ARCHIVE" >/dev/null 2>&1; then
    echo "ERROR: Backup archive failed its integrity test."
    exit 1
fi

ARCHIVE_FILE_COUNT="$(
    unzip -Z1 "$STAGED_ARCHIVE" |
    wc -l |
    tr -d ' '
)"

if [ "$ARCHIVE_FILE_COUNT" -eq 0 ]; then
    echo "ERROR: The archive contains no project files."
    exit 1
fi

# Confirm no real secret file is inside the archive.
# .env.example is expected and allowed; see section 2.
ARCHIVED_SECRET_FILES="$(
    unzip -Z1 "$STAGED_ARCHIVE" |
    grep -E '(^|/)\.env($|\.)' |
    grep -v -E '(^|/)\.env\.example$' ||
    true
)"

if [ -n "$ARCHIVED_SECRET_FILES" ]; then
    echo "ERROR: An environment file was found inside the archive:"
    echo "$ARCHIVED_SECRET_FILES"
    exit 1
fi

echo "Archive integrity verified ($ARCHIVE_FILE_COUNT entries)."

# ==================================================
# 7. Checksum, then upload to Google Drive
# ==================================================

echo "Calculating SHA-256 checksum..."

(cd "$STAGING_DIR" && shasum -a 256 "$ARCHIVE_NAME" > "$CHECKSUM_NAME")

ARCHIVE_SHA256="$(awk '{print $1}' "$STAGING_DIR/$CHECKSUM_NAME")"

echo "SHA-256: $ARCHIVE_SHA256"

echo "Copying archive and checksum to Google Drive..."

cp "$STAGED_ARCHIVE" "$ARCHIVE_PATH"
cp "$STAGING_DIR/$CHECKSUM_NAME" "$CHECKSUM_PATH"

# ==================================================
# 8. Verify the uploaded copies at their destination
# ==================================================
#
# Verifying the staged file proves nothing about what
# landed in Drive. These checks run on the copies.

echo "Verifying uploaded files..."

if [ ! -f "$ARCHIVE_PATH" ] || [ ! -f "$CHECKSUM_PATH" ]; then
    echo "ERROR: Uploaded files are missing from the Drive folder."
    exit 1
fi

if ! (cd "$BACKUP_DIR" && shasum -a 256 -c "$CHECKSUM_NAME"); then
    echo "ERROR: The uploaded archive does not match its checksum."
    rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"
    exit 1
fi

if ! unzip -t "$ARCHIVE_PATH" >/dev/null 2>&1; then
    echo "ERROR: The uploaded archive failed its integrity test."
    rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"
    exit 1
fi

# ==================================================
# 9. Final verification
# ==================================================

CURRENT_LOCAL_COMMIT="$(git rev-parse HEAD)"
CURRENT_REMOTE_COMMIT="$(git rev-parse "origin/$BRANCH")"

if [ "$CURRENT_LOCAL_COMMIT" != "$CURRENT_REMOTE_COMMIT" ]; then
    echo "ERROR: Git synchronization changed during backup."
    exit 1
fi

if [ "$CURRENT_LOCAL_COMMIT" != "$LOCAL_COMMIT" ]; then
    echo "ERROR: The commit changed while the backup was running."
    exit 1
fi

ARCHIVE_SIZE="$(du -h "$ARCHIVE_PATH" | awk '{print $1}')"

echo ""
echo "=================================================="
echo "BACKUP COMPLETED SUCCESSFULLY"
echo "=================================================="
echo "Local Git commit: $CURRENT_LOCAL_COMMIT"
echo "GitHub branch: origin/$BRANCH"
echo "Archive: $ARCHIVE_PATH"
echo "Checksum: $CHECKSUM_PATH"
echo "SHA-256: $ARCHIVE_SHA256"
echo "Archive size: $ARCHIVE_SIZE"
echo "Archived entries: $ARCHIVE_FILE_COUNT"
echo "Completed: $(date)"
echo "=================================================="
