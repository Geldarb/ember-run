#!/usr/bin/env bash
# Publish public/ to the gh-pages branch (GitHub Pages serves that branch's root).
set -e
cd "$(dirname "$0")"
git push origin "$(git subtree split --prefix public main)":refs/heads/gh-pages --force
