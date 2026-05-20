// ═══════════════════════════════════════════════════════════════════════════
// Jama Browser Import — Typed errors
// ═══════════════════════════════════════════════════════════════════════════
//
// Each error type maps to a specific user-facing message and recovery path
// surfaced by the frontend (e.g. LoginFailed → "Sign in again" button;
// ReportTimeout → "Retry" button; ProfileNotFound → "Edit profile" link).
//
// Every error carries a stable `code` string so the API layer can serialize
// it for the frontend without leaking class hierarchies.

class JamaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class LoginFailed extends JamaError {
  constructor(message = "Sign in to Jama failed — check your username and password") {
    super(message, "JAMA_LOGIN_FAILED");
  }
}

class NavigationFailed extends JamaError {
  constructor(message) {
    super(message, "JAMA_NAVIGATION_FAILED");
  }
}

class ReportTimeout extends JamaError {
  constructor(message = "Jama did not finish generating the report in time") {
    super(message, "JAMA_REPORT_TIMEOUT");
  }
}

class ExportConfigError extends JamaError {
  constructor(message) {
    super(message, "JAMA_EXPORT_CONFIG_ERROR");
  }
}

// Raised when Jama's "Export failed" toast appears after we click Run, or
// when the Reports History row shows a failure status. The orchestrator
// catches this once and retries after a page reload; if the retry also
// fails, the error propagates to the user.
class ExportFailed extends JamaError {
  constructor(message = "Jama reported 'Export failed' after clicking Run") {
    super(message, "JAMA_EXPORT_FAILED");
  }
}

// Raised when a profile's saved project or filter no longer exists in Jama
// (renamed, deleted, or user lost access). The frontend should offer to
// edit/recreate the profile.
class ProfileNotFound extends JamaError {
  constructor(message = "The project or filter in this profile no longer exists in Jama") {
    super(message, "JAMA_PROFILE_NOT_FOUND");
  }
}

// Catch-all for selector misses or unexpected page state during navigation.
// In v1.1 this is where the Claude fallback would be invoked; for MVP we
// just surface a clean "we got stuck, try again or contact admin" message.
class UnexpectedPageState extends JamaError {
  constructor(message) {
    super(message, "JAMA_UNEXPECTED_PAGE_STATE");
  }
}

module.exports = {
  JamaError,
  LoginFailed,
  NavigationFailed,
  ReportTimeout,
  ExportConfigError,
  ExportFailed,
  ProfileNotFound,
  UnexpectedPageState,
};
