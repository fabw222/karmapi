#!/bin/bash
# Anchor build script with correct PATH and platform-tools version
#
# Fixes two issues:
# 1. Uses rustup's cargo which supports +toolchain syntax
# 2. Uses platform-tools v1.52 (Rust 1.89) which supports edition2024

export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

if [ "$1" = "test" ]; then
    # For tests, use --skip-build if programs are already built
    anchor test --skip-build "${@:2}"
elif [ "$1" = "build-only" ]; then
    # Build without IDL
    anchor build --no-idl -- --tools-version v1.52
else
    # Full build with IDL (may have issues with cargo test step)
    # If IDL fails, use build-only and generate IDL separately
    anchor build --no-idl -- --tools-version v1.52
    echo ""
    echo "Build complete. IDL generation skipped (use 'anchor idl build' if needed)"
fi
