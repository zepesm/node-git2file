#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ignore = require('ignore'); // npm install ignore
const glob = require('glob'); // npm install glob - Add glob for finding files

/**
 * Finds all .gitignore files within a directory and its subdirectories.
 * @param {string} startPath - The root directory path.
 * @returns {string[]} - An array of absolute paths to .gitignore files.
 */
function findAllGitignoreFiles(startPath) {
    try {
        // Use glob sync for simplicity here, could be async for larger repos
        // Note: ignores node_modules by default unless overridden
        // We search relative to startPath but get absolute paths back
        const files = glob.sync('**/.gitignore', {
            cwd: startPath,
            absolute: true,
            ignore: ['**/node_modules/**', '**/.git/**'], // Avoid heavy/irrelevant dirs
            dot: true, // Include dotfiles like .gitignore
            follow: false // Don't follow symlinks
        });
        // Also include the root .gitignore if it exists
        const rootGitignore = path.join(startPath, '.gitignore');
        if (fs.existsSync(rootGitignore) && !files.includes(rootGitignore)) {
            files.push(rootGitignore);
        }
        return files;
    } catch (err) {
        console.error(`Error searching for .gitignore files: ${err.message}`);
        return [];
    }
}

/**
 * Parses all .gitignore files in a directory tree and optionally an additional exclusion file,
 * returning an ignore instance.
 * @param {string} startPath - The root directory path of the repository.
 * @param {string|null} additionalExclusionFilePath - Optional path to an extra exclusion file.
 * @returns {import('ignore').Ignore} - An ignore instance populated with rules.
 */
function parseExclusionFiles(startPath, additionalExclusionFilePath = null) {
    const ig = ignore();
    // Always ignore .git directory itself
    ig.add('.git/');
    // Always ignore .gitignore files themselves
    ig.add('.gitignore');

    // --- Process .gitignore files first ---
    const gitignoreFiles = findAllGitignoreFiles(startPath);
    console.log(`Found .gitignore files: ${gitignoreFiles.length > 0 ? gitignoreFiles.map(f => path.relative(startPath, f) || '.gitignore').join(', ') : 'None'}`);

    gitignoreFiles.forEach(filePath => {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const fileDir = path.dirname(filePath);
            // Calculate dir relative to startPath, using POSIX separators
            const relativeFileDir = path.relative(startPath, fileDir).split(path.sep).join(path.posix.sep);

            const patterns = fileContent.split(/\r?\n/).filter(line => line.trim() !== '' && !line.startsWith('#'));

            // Add patterns, adjusting for their location relative to startPath
            const adjustedPatterns = patterns.map(pattern => {
                 const isNegative = pattern.startsWith('!');
                 if (isNegative) {
                     pattern = pattern.substring(1);
                 }
                 // Convert path separators in the pattern itself to POSIX
                 const posixPattern = pattern.split(path.sep).join(path.posix.sep);

                 let adjusted = posixPattern;
                 // If pattern is relative (doesn't start with /) and we are in a subdirectory,
                 // prepend the relative directory path.
                 if (relativeFileDir && !posixPattern.startsWith('/')) {
                      adjusted = path.posix.join(relativeFileDir, posixPattern);
                 } else {
                     // Pattern is absolute (starts with /) or we are in the root directory
                     // Trim leading / if present, as ignore() paths are relative to the root
                     adjusted = posixPattern.startsWith('/') ? posixPattern.substring(1) : posixPattern;
                 }

                 return isNegative ? '!' + adjusted : adjusted;
            });

            if (adjustedPatterns.length > 0) {
                 const displayPath = path.relative(startPath, filePath) || '.gitignore'; // Use relative path for logging
                 console.log(`  Adding patterns from: ${displayPath}`);
                 ig.add(adjustedPatterns);
            }
        } catch (err) {
            console.warn(`Error reading or processing .gitignore file ${filePath}: ${err.message}. Skipping this file.`);
        }
    });

    // --- Process additional exclusion file if provided ---
    if (additionalExclusionFilePath) {
        const absoluteExclusionPath = path.resolve(additionalExclusionFilePath);
        if (fs.existsSync(absoluteExclusionPath)) {
            try {
                console.log(`Processing additional exclusion file: ${additionalExclusionFilePath}`);
                const fileContent = fs.readFileSync(absoluteExclusionPath, 'utf-8');
                const patterns = fileContent.split(/\r?\n/)
                    .map(line => line.trim()) // Trim whitespace first
                    .filter(line => line !== '' && !line.startsWith('#')); // Filter after trimming

                if (patterns.length > 0) {
                    // Treat these patterns as relative to the startPath (like root .gitignore)
                    // Convert separators to POSIX
                    const adjustedPatterns = patterns.map(p => p.split(path.sep).join(path.posix.sep));

                    if (adjustedPatterns.length > 0) {
                        console.log(`  Adding patterns from: ${additionalExclusionFilePath}`);
                        ig.add(adjustedPatterns);
                    }
                }
            } catch (err) {
                console.warn(`Error reading or processing additional exclusion file ${additionalExclusionFilePath}: ${err.message}. Skipping this file.`);
            }
        } else {
            console.warn(`Warning: Additional exclusion file specified but not found: ${additionalExclusionFilePath}`);
        }
    }

    if (gitignoreFiles.length === 0 && !additionalExclusionFilePath) {
        console.log("No .gitignore or additional exclusion file found/provided. Defaulting to ignoring only '.git/' and '.gitignore'.");
    }

    return ig;
}

/**
 * Generates a tree-like string representation of the directory structure.
 * @param {string} startPath - The root directory path.
 * @param {import('ignore').Ignore} ig - The ignore instance.
 * @returns {string} - The directory tree string.
 */
function generateDirectoryStructure(startPath, ig) {
    let tree = '/\n';

    function buildTree(dirPath, prefix = '') {
        let entries;
        try {
            entries = fs.readdirSync(dirPath);
        } catch (err) {
            console.warn(`Could not read directory: ${dirPath}. Skipping. Error: ${err.message}`);
            return; // Skip directories we can't read
        }

        // Separate directories and files, then sort
        const dirs = entries.filter(entry => {
             try {
                 return fs.statSync(path.join(dirPath, entry)).isDirectory();
             } catch { return false; } // Handle potential stat errors
        }).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        const files = entries.filter(entry => {
             try {
                 return !fs.statSync(path.join(dirPath, entry)).isDirectory();
             } catch { return false; } // Handle potential stat errors
        }).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        const sortedEntries = [...dirs, ...files];
        const filteredEntries = sortedEntries.filter(entry => {
            const relPath = path.relative(startPath, path.join(dirPath, entry));
            // ignore() needs POSIX paths, especially for directory checks
            const posixRelPath = relPath.split(path.sep).join(path.posix.sep);
            try {
                 const isDir = fs.statSync(path.join(dirPath, entry)).isDirectory();
                 // Add trailing slash for directories for ignore check
                 return !ig.ignores(posixRelPath + (isDir ? '/' : ''));
            } catch {
                 return false; // Ignore if stat fails
            }
        });

        filteredEntries.forEach((entry, index) => {
            const isLast = index === filteredEntries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            const fullPath = path.join(dirPath, entry);
            const relPath = path.relative(startPath, fullPath);

            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    tree += `${prefix}${connector}${entry}/\n`;
                    buildTree(fullPath, newPrefix);
                } else {
                    tree += `${prefix}${connector}${entry}\n`;
                }
            } catch (err) {
                 console.warn(`Could not stat path: ${fullPath}. Skipping in tree. Error: ${err.message}`);
            }
        });
    }

    buildTree(startPath);
    return tree;
}

/**
 * Scans the folder, generates the structure and file contents, writing to the output file.
 * @param {string} startPath - The root directory of the repository.
 * @param {string[]} fileExtensions - Optional array of file extensions to include (e.g., ['.js', '.ts']). Null to include all.
 * @param {string} outputFile - The path to write the output.
 * @param {import('ignore').Ignore} ig - The ignore instance.
 */
function scanFolder(startPath, fileExtensions, outputFile, ig) {
    let outputContent = "";

    // 1. Generate Directory Structure
    outputContent += "Directory Structure:\n";
    outputContent += "-------------------\n";
    outputContent += generateDirectoryStructure(startPath, ig);
    outputContent += "\n\n";
    outputContent += "File Contents:\n";
    outputContent += "--------------\n";

    const filesToInclude = [];

    // 2. Walk directories to find files to include
    function findFiles(dirPath) {
        let entries;
         try {
            entries = fs.readdirSync(dirPath);
        } catch (err) {
            console.warn(`Could not read directory: ${dirPath}. Skipping content scan. Error: ${err.message}`);
            return; // Skip directories we can't read
        }

        entries.forEach(entry => {
            const fullPath = path.join(dirPath, entry);
            const relPath = path.relative(startPath, fullPath);
            // Use POSIX paths for ignore check
            const posixRelPath = relPath.split(path.sep).join(path.posix.sep);

            try {
                const stats = fs.statSync(fullPath);
                const isDir = stats.isDirectory();
                 // Add trailing slash for directories for ignore check
                if (ig.ignores(posixRelPath + (isDir ? '/' : ''))) {
                    return; // Skip excluded files/directories
                }

                if (isDir) {
                    findFiles(fullPath); // Recurse into subdirectories
                } else if (stats.isFile()) {
                    const ext = path.extname(entry);
                    if (!fileExtensions || fileExtensions.length === 0 || fileExtensions.includes(ext)) {
                        filesToInclude.push({ fullPath, relPath: posixRelPath }); // Store POSIX path for consistency
                    }
                }
            } catch (err) {
                 console.warn(`Could not stat path: ${fullPath}. Skipping content scan. Error: ${err.message}`);
            }
        });
    }

    findFiles(startPath);

    // 3. Read and append file contents
    filesToInclude.forEach(({ fullPath, relPath }) => {
        console.log(`Processing: ${relPath}`);
        outputContent += `\nFile: ${relPath}\n`;
        outputContent += "--------------------------------------------------\n";
        try {
            // Attempt to read as UTF-8, warn if it fails (likely binary)
            const content = fs.readFileSync(fullPath, 'utf-8');
            outputContent += `Content of ${relPath}:\n`;
            outputContent += content;
        } catch (error) {
            const partialError = error.message.substring(0, 100); // Avoid huge error messages
            const warning = `Error reading file ${relPath}: ${partialError}. Might be binary or invalid encoding. Skipping content.`;
            console.warn(warning);
            outputContent += `<<< ${warning} >>>`;
        }
        outputContent += "\n\n";
    });

    // 4. Write to output file
    try {
        fs.writeFileSync(outputFile, outputContent, 'utf-8');
        console.log(`Scan complete. Results written to ${outputFile}`);
    } catch (err) {
        console.error(`Error writing to output file ${outputFile}: ${err.message}`);
        process.exit(1); // Exit with error code if writing fails
    }
}

/**
 * Main execution function.
 */
function main() {
    const args = process.argv.slice(2); // Skip 'node' and script path

    // Updated Usage: node repo2file.js <start_path> <output_file> [custom_exclusion_file] [.ext1 .ext2 ...]
    if (args.length < 2) {
        console.error("Usage: node repo2file.js <start_path> <output_file> [custom_exclusion_file] [.ext1 .ext2 ...]");
        console.error("Example (basic): node repo2file.js . repo_dump.txt");
        console.error("Example (extensions): node repo2file.js . repo_dump.txt .js .ts");
        console.error("Example (custom exclusion): node repo2file.js . repo_dump.txt exclusions.txt");
        console.error("Example (custom exclusion + extensions): node repo2file.js ../proj dump.txt .myignore .py .java");
        process.exit(1);
    }

    const startPath = path.resolve(args[0]); // Resolve to absolute path
    const outputFile = path.resolve(args[1]);
    let additionalExclusionFilePath = null;
    let fileExtensions = null;
    let extensionArgIndex = 2; // Default starting index for extensions

    // Check if a third argument exists
    if (args.length > 2) {
        const thirdArg = args[2];
        // Treat as extension ONLY if it starts with '.' AND contains NO path separators (like / or \)
        const isLikelyExtension = thirdArg.startsWith('.') && !thirdArg.includes(path.sep) && !thirdArg.includes('/');

        if (!isLikelyExtension) {
            // Assume it's an exclusion file path if it's not likely an extension
            additionalExclusionFilePath = thirdArg;
            extensionArgIndex = 3; // Extensions start from the 4th argument now
            console.log(`Using additional exclusion file: ${additionalExclusionFilePath}`);
        }
         // Otherwise, it's treated as the start of extensions (or ignored if no more args)
    }

    // File extensions are all remaining arguments from extensionArgIndex onwards
    if (args.length > extensionArgIndex) {
        fileExtensions = args.slice(extensionArgIndex);
    }

    if (!fs.existsSync(startPath) || !fs.statSync(startPath).isDirectory()) {
        console.error(`Error: Start path "${startPath}" is not a valid directory.`);
        process.exit(1);
    }

    // Initialize ignore instance by finding/parsing .gitignore files and the optional additional file
    const ig = parseExclusionFiles(startPath, additionalExclusionFilePath);

    console.log(`Starting scan of "${startPath}"...`);
    if (fileExtensions) {
        console.log(`Including file extensions: ${fileExtensions.join(', ')}`);
    } else {
        console.log("Including all file types (no specific extensions provided).");
    }
    console.log(`Writing output to "${outputFile}"...`);

    // Proceed with scanning using the generated ignore instance
    scanFolder(startPath, fileExtensions, outputFile, ig);
}

// Run the main function
main();