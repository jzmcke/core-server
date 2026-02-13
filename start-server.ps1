# Core Server Startup Script
# Automatically sets up symlinks and starts the server

$ErrorActionPreference = "SilentlyContinue"

# Change to script directory
Set-Location "$PSScriptRoot\script"

# Create symlink for blob.js if it doesn't exist
$blobJsPath = "blob.js"
if (-not (Test-Path $blobJsPath))
{
    Write-Host "Creating symlink for blob.js..."
    cmd /c mklink blob.js ..\..\blob\js\blob.js
    
    if ($LASTEXITCODE -eq 0)
    {
        Write-Host "Symlink created successfully"
    }
    else
    {
        Write-Host "Failed to create symlink (may require admin privileges)"
        Write-Host "Copying blob.js as fallback..."
        Copy-Item ..\..\blob\js\blob.js blob.js
    }
}
else
{
    Write-Host "blob.js already exists"
}

# Start the server
Write-Host ""
Write-Host "Starting core-server..."
node express-server.js
