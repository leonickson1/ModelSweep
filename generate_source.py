#!/usr/bin/python3

import os
import sys
from pathlib import Path

def generate_source_txt(root_dir, output_file):
    root_path = Path(root_dir).resolve()

    if not root_path.is_dir():
        print(f"Error: {root_dir} is not a valid directory.")
        sys.exit(1)

    # Extensions relevant to this project (Next.js / TypeScript)
    valid_extensions = {
        '.ts', '.tsx', '.js', '.jsx', '.mjs',   # TypeScript / JavaScript
        '.css',                                    # Styles
        '.py', '.sh',                              # Scripts
    }

    # Directories to skip entirely
    skip_dirs = {
        'node_modules', '.next', '.git', 'dist', 'build',
        '.turbo', '.cache', '.DS_Store', '__pycache__',
    }

    # Files to skip
    skip_files = {
        'package-lock.json',   # Huge, not useful
        '.DS_Store',
    }

    file_count = 0
    total_lines = 0

    with open(output_file, 'w', encoding='utf-8') as outfile:
        for file_path in sorted(root_path.rglob('*')):
            # Skip if inside a skipped directory
            if any(part in skip_dirs for part in file_path.parts):
                continue

            # Skip directories, the output file itself, and blocklisted files
            if not file_path.is_file():
                continue
            if file_path.suffix not in valid_extensions:
                continue
            if file_path.name in skip_files:
                continue
            if file_path.resolve() == Path(output_file).resolve():
                continue

            try:
                relative_path = file_path.relative_to(root_path)

                with open(file_path, 'r', encoding='utf-8', errors='replace') as infile:
                    content = infile.read()

                # Write the header
                outfile.write(f"\n{'='*80}\n")
                outfile.write(f"FILE: {relative_path}\n")
                outfile.write(f"{'='*80}\n\n")

                # Write the content
                outfile.write(content)
                outfile.write("\n")

                file_count += 1
                total_lines += content.count('\n')

            except Exception as e:
                print(f"Could not read {file_path}: {e}")

    print(f"Done! {file_count} files, ~{total_lines} lines → {output_file}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_source.py <directory_path> [output_filename]")
        sys.exit(1)

    target_dir = sys.argv[1]
    out_name = sys.argv[2] if len(sys.argv) > 2 else "source_compilation.txt"

    generate_source_txt(target_dir, out_name)
