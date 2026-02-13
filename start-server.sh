#!/bin/bash
# Core Server Startup Script (Linux/Mac)
# Automatically sets up symlinks and starts the server

cd "$(dirname "$0")/script"

# Create symlink for blob.js if it doesn't exist
if [ ! -e "blob.js" ]; then
    echo "Creating symlink for blob.js..."
    ln -s ../../blob/js/blob.js blob.js
    if [ $? -eq 0 ]; then
        echo "✓ Symlink created successfully"
    else
        echo "✗ Failed to create symlink"
        echo "  Copying blob.js as fallback..."
        cp ../../blob/js/blob.js blob.js
    fi
else
    echo "✓ blob.js already exists"
fi

# Start the server
echo ""
echo "Starting core-server..."
node express-server.js
