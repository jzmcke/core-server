# Core Server

WebSocket server for real-time blob data visualization.

## Quick Start

### Windows
```powershell
.\start-server.ps1
```

### Linux/Mac
```bash
chmod +x start-server.sh
./start-server.sh
```

The startup scripts automatically:
- Create symlink for `blob.js` from the blob repository
- Start the Node.js server on port 8000

## Manual Setup

If you prefer to run the server manually:

1. Create the blob.js symlink (one-time setup):
   ```powershell
   # Windows
   cd script
   cmd /c mklink blob.js ..\..\blob\js\blob.js
   ```

2. Start the server:
   ```bash
   cd script
   node express-server.js
   ```

## Dependencies

The server uses a junction link to the parent `blob` directory for accessing blob library files.
