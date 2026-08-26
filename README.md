# Taco Cat Goat Cheese Pizza — Online Multiplayer

This is a deployment-ready Node.js + Express + Socket.IO multiplayer server.

## What you get

- Create/join rooms with a 6-character room code
- 2–5 players
- Private player hands
- Server-authoritative turns and pile
- Real-time match/slap events
- Public health endpoint at `/health`
- Railway configuration included

## Deploy on Railway

1. Create a GitHub repository and upload the contents of this folder.
2. Open Railway and create a new project from your GitHub repository.
3. Railway detects the Node.js project and runs `npm start`.
4. In the service settings, generate a public domain.
5. Open that domain on your phone. The URL is the game link you can send to friends.

Railway's current documentation supports GitHub-based deployment and generating a public domain from the service Networking settings:
https://docs.railway.com/quick-start
https://docs.railway.com/guides/express

## Local test

Requires Node.js 18+.

    npm install
    npm start

Then open:

    http://localhost:3000

Health check:

    http://localhost:3000/health

## Important

This first online version stores rooms in server memory. If the server restarts, active rooms disappear. For a later production version, add a database/Redis layer and persistent room/session handling.

## Android app

The Android app should connect to the same public HTTPS domain. Socket.IO will use the secure connection automatically when the page/app is served over HTTPS.
