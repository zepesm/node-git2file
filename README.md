# Repository to Single File (`repo2file.js`)

This Node.js script scans a specified repository directory, processes its structure and file contents according to `.gitignore` rules and optional custom exclusions/filters, and consolidates the results into a single text file. This is useful for providing context to Large Language Models (LLMs) or for creating a snapshot of a codebase.

## Features

- **Directory Structure:** Generates a text-based tree view of the repository's directory structure.
- **File Contents:** Includes the full content of processed files.
- **Automatic `.gitignore` Handling:** Automatically discovers and respects rules from all `.gitignore` files found within the target directory tree.
  - Patterns in `.gitignore` files are correctly interpreted relative to their location.
  - The `.git` directory and the `.gitignore` files themselves are always excluded.
- **Custom Exclusion File:** Optionally allows specifying an additional exclusion file (similar format to `.gitignore`) whose rules are applied globally (relative to the start path).
- **File Extension Filtering:** Optionally allows including only files with specific extensions (e.g., `.js`, `.ts`, `.py`).
- **Binary File Handling:** Detects potential binary files or files with non-UTF-8 encoding, includes a warning in the output, and skips their content to avoid corrupting the output file.
- **Cross-Platform Compatibility:** Uses `path` module for handling different OS path separators.

## Prerequisites

- [Node.js](https://nodejs.org/) (which includes npm)

## Dependencies

The script relies on the following npm packages, which should be listed in your `package.json`:

- `ignore`: For parsing `.gitignore` rules.
- `glob`: For finding `.gitignore` files.

## Installation

1.  Clone the repository or download the `repo2file.js` and `package.json` files.
2.  Navigate to the project directory in your terminal.
3.  Install the dependencies using npm:

    ```bash
    npm install
    ```

## Usage

The script is run from the command line using Node.js:

```bash
node repo2file.js <start_path> <output_file> [custom_exclusion_file] [.ext1 .ext2 ...]
```

**Arguments:**

- `<start_path>`: (Required) The path to the root directory of the repository you want to scan.
- `<output_file>`: (Required) The path where the consolidated text output will be saved.
- `[custom_exclusion_file]`: (Optional) Path to an additional file containing exclusion patterns (one per line, like `.gitignore`). If this argument is present and doesn't start with a `.` followed immediately by a non-separator character, it's treated as this exclusion file.
- `[.ext1 .ext2 ...]`: (Optional) One or more file extensions to include (e.g., `.js` `.ts` `.md`). If provided, only files with these extensions (that are not otherwise excluded) will have their content included. If omitted, all non-excluded files are included.

**Examples:**

1.  **Basic Scan (current directory to `dump.txt`):**

    ```bash
    node repo2file.js . dump.txt
    ```

2.  **Scan a different directory, filter for JS/TS files:**

    ```bash
    node repo2file.js ../my-project project_dump.txt .js .ts
    ```

3.  **Scan current directory, use a custom exclusion file `exclusions.txt`, include all file types:**

    ```bash
    node repo2file.js . output.txt exclusions.txt
    ```

4.  **Scan current directory, use custom exclusions, and filter for Python/Java files:**
    ```bash
    node repo2file.js . output.txt .myignore .py .java
    ```

## Output File Format

The generated output file (`<output_file>`) has the following structure:

1.  **Directory Structure Section:**

    - Starts with `Directory Structure:` header.
    - Displays a tree view of the included directories and files.

2.  **File Contents Section:**
    - Starts with `File Contents:` header.
    - For each included file:
      - A `File: <relative_path_to_file>` header.
      - A separator line (`--------------------------------------------------`).
      - The text `Content of <relative_path_to_file>:`.
      - The full content of the file.
      - (If the file is likely binary or unreadable as UTF-8, a warning message like `<<< Error reading file ... >>>` is included instead of the content).
    - Files are separated by double newlines.

## How Exclusions Work

1.  The script **always** ignores the `.git` directory and any file named `.gitignore`.
2.  It finds **all** `.gitignore` files within the `<start_path>` directory tree.
3.  Patterns from each `.gitignore` are read and applied relative to that `.gitignore` file's location.
4.  If a `[custom_exclusion_file]` is provided, its patterns are read and applied relative to the `<start_path>` (like a root `.gitignore`).
5.  A file or directory is excluded if it matches **any** applicable ignore pattern from any `.gitignore` or the custom exclusion file, unless a later negation pattern (`!pattern`) overrides it.
6.  The final check includes filtering by file extensions if they are provided.
