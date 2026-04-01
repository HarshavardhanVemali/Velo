# Contributing to Velo

Thank you for your interest in contributing to Velo! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Making Changes](#making-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [Feature Requests](#feature-requests)

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## Getting Started

### Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Python | 3.10+ | Backend runtime |
| Node.js | 18+ | Frontend tooling |
| Git | 2.30+ | Version control |
| pip | 21+ | Python package manager |

### Fork & Clone

1. Fork the repository on GitHub.
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/velo.git
   cd velo
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/original-owner/velo.git
   ```

---

## Development Setup

### Backend

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install in editable mode with dev dependencies
pip install -e ".[dev]"

# Copy and configure environment
cp .env.example .env
# Edit .env and add at minimum: GEMINI_API_KEY

# Start the development server
PYTHONPATH=src uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

The frontend dev server runs at `http://127.0.0.1:5173` and proxies API calls to `http://127.0.0.1:8000`.

### Verify Everything Works

```bash
# Health check
curl http://127.0.0.1:8000/health
# Expected: {"status": "ok"}

# Run backend tests
pytest

# Run frontend tests
cd frontend && npm test
```

---

## Project Architecture

Understanding the codebase will help you make effective contributions:

```
src/
├── agent_core.py          # Gemini agent loop — tool declarations, execution, multi-step reasoning
├── calendar_manager.py    # Google Calendar + Meet integration — OAuth, event creation
├── notification_manager.py # AWS SES email — HTML templates, multipart sending
├── env.py                 # Environment loader (stable path resolution)
├── api/
│   ├── main.py            # FastAPI app factory, CORS, router registration
│   ├── dependencies.py    # Singleton instances (RunStore, RunService)
│   └── routes/
│       ├── runs.py        # Run CRUD, event streaming, human response
│       └── auth.py        # Google OAuth flow endpoints
├── services/
│   ├── run_store.py       # Thread-safe in-memory store with SQLite persistence
│   ├── run_service.py     # Run orchestration, clarification detection, background execution
│   └── run_persistence.py # SQLite serialization logic
└── schemas/
    ├── runs.py            # Pydantic models for API request/response
    └── auth.py            # Pydantic models for OAuth endpoints
```

### Key Design Decisions

- **Thread-safe run store**: `RunStore` uses a `threading.Lock` to allow safe concurrent access from API handlers and background agent threads.
- **Event-driven architecture**: Every step in the agent loop emits events, enabling real-time UI updates via polling.
- **Lazy initialization**: Google Calendar API and SES clients are initialized on first use, making unit testing with mocks straightforward.
- **Tool name inference**: The agent core can infer which tool to call even when Gemini omits the function name, improving robustness.

---

## Making Changes

### Branch Naming

Create a descriptive branch from `main`:

```bash
git checkout main
git pull upstream main
git checkout -b type/short-description
```

Branch type prefixes:

| Prefix | Use Case |
|--------|----------|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `refactor/` | Code refactoring (no behavior change) |
| `test/` | Adding or updating tests |
| `chore/` | Build, CI, tooling changes |

Examples: `feat/slack-notifications`, `fix/calendar-timezone-offset`, `docs/api-examples`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

Longer explanation of what changed and why.

Closes #123
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples**:
```
feat(agent): add Slack webhook tool to agent loop
fix(calendar): handle timezone-naive datetime inputs
docs(readme): add deployment guide for Railway
test(api): add edge case tests for empty prompt validation
```

---

## Coding Standards

### Python (Backend)

- **Style**: Follow [PEP 8](https://peps.python.org/pep-0008/). Use 4-space indentation.
- **Type hints**: Use type annotations for all function signatures.
- **Docstrings**: Use Google-style docstrings for public functions.
- **Imports**: Group as `stdlib → third-party → local`. Use absolute imports.
- **Error handling**: Return structured `{"status": "error", "message": "..."}` dicts from tool functions rather than raising exceptions.

```python
# Good
def create_event(summary: str, start_time_iso: str) -> Dict[str, Any]:
    """Create a calendar event.

    Args:
        summary: Event title.
        start_time_iso: ISO 8601 start time in UTC.

    Returns:
        Dict with status and event details.
    """
    ...

# Bad
def create_event(summary, start_time_iso):
    ...
```

### TypeScript (Frontend)

- **Style**: Follow the ESLint config in `eslint.config.js`.
- **Types**: Use TypeScript types for all props, state, and API responses. Avoid `any`.
- **Components**: Use functional components with hooks. Keep components focused and reusable.
- **Naming**: PascalCase for components, camelCase for functions and variables.

```tsx
// Good
interface TaskComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isBusy: boolean
}

// Bad
function TaskComposer(props: any) { ... }
```

---

## Testing

### Running Tests

```bash
# All backend tests
pytest

# Specific test file
pytest tests/test_agent_core.py

# Verbose output
pytest -v

# Frontend tests
cd frontend && npm test

# Frontend tests in watch mode
cd frontend && npm run test:watch
```

### Writing Tests

#### Backend Tests

- Place tests in the `tests/` directory.
- Name test files `test_*.py` and test functions `test_*`.
- Use `pytest-mock` (`mocker` fixture) for mocking external services.
- Reset global state in fixtures (see `conftest.py` for the SES client pattern).

```python
def test_calendar_conflict_returns_error(mocker):
    """Calendar 409 conflict should return a structured error, not raise."""
    mock_insert = mocker.MagicMock()
    mock_insert.execute.side_effect = HttpError(
        Response({"status": "409"}), b"Conflict"
    )
    # ... setup and assertions
```

#### Frontend Tests

- Place tests alongside source files or in `src/test/`.
- Use `@testing-library/react` for component tests.
- Use `vi.mock()` to mock API modules.
- Test user interactions with `@testing-library/user-event`.

```tsx
test('submits a task and shows clarification', async () => {
  startRun.mockResolvedValue(buildRun())
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: /run agent/i }))
  expect(await screen.findByText(/Human review needed/i)).toBeInTheDocument()
})
```

### Test Requirements for PRs

- All existing tests must pass.
- New features must include tests.
- Bug fixes should include a regression test.
- Aim for meaningful coverage, not 100% line coverage.

---

## Pull Request Process

### Before Submitting

1. [x] Your branch is up-to-date with `main`.
2. [x] All tests pass (`pytest` and `npm test`).
3. [x] Linting passes (`cd frontend && npm run lint`).
4. [x] You've added tests for new functionality.
5. [x] You've updated documentation if needed (README, docstrings, etc.).

### Submitting

1. Push your branch to your fork.
2. Open a pull request against `main` on the upstream repository.
3. Fill out the PR template with:
   - **What** changed and **why**.
   - Screenshots/recordings for UI changes.
   - Link to the related issue (if any).
4. Request review from a maintainer.

### Review Process

- A maintainer will review your PR within **3 business days**.
- Address review feedback by pushing new commits (avoid force-pushing during review).
- Once approved, a maintainer will merge using **squash and merge**.

---

## Reporting Issues

### Bug Reports

When reporting a bug, please include:

1. **Summary**: Clear one-line description.
2. **Steps to reproduce**: Numbered steps to trigger the bug.
3. **Expected behavior**: What should happen.
4. **Actual behavior**: What actually happens.
5. **Environment**: OS, Python version, Node version, browser.
6. **Logs/screenshots**: Relevant error messages or UI screenshots.

### Security Vulnerabilities

**Do NOT open a public issue for security vulnerabilities.**  
See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

---

## Feature Requests

We love feature ideas! When proposing a feature:

1. **Check existing issues** to avoid duplicates.
2. **Describe the problem** the feature would solve.
3. **Propose a solution** with implementation ideas if you have them.
4. **Consider alternatives** you've thought about.

### Ideas for First-Time Contributors

Looking for a good first issue? Here are areas where contributions are welcome:

| Area | Ideas |
|------|-------|
| **New tools** | Slack notifications, Zoom integration, task managers (Jira, Linear) |
| **Agent improvements** | Multi-language support, conversation memory, smarter time parsing |
| **Frontend** | Mobile responsive layout, keyboard shortcuts, run search/filter |
| **Infrastructure** | Docker compose setup, CI/CD pipeline, API rate limiting |
| **Documentation** | Deployment guides, API usage examples, video tutorials |
| **Testing** | Edge case tests, load testing, E2E browser tests |

---

## Questions?

- Open a Discussion for questions and ideas.
- Check existing Issues for known bugs and feature requests.
- Read the [README](README.md) for project overview and setup.

Thank you for helping make Velo better!
