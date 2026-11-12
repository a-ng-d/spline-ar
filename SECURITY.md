# Security Policy

## Supported versions

Only the current `main` branch, deployed at https://spline-ar.netlify.app, is supported.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: go to the repository's **Security** tab, then **Report a vulnerability**. Describe the problem, the steps to reproduce it and the possible impact. You will get an answer as soon as possible; this is a small volunteer project, so please allow a few days.

## Scope

Things worth reporting include:

- the upload endpoint (`POST /api/cibles`, `netlify/functions/targets.mjs`) and the file endpoint (`/c/<id>/<file>`): bypassing the size and format checks, storing arbitrary content, reading other files;
- script injection through link parameters (titles, scene URLs, back links) or link previews;
- anything that would let a link run code or redirect somewhere unexpected.

Out of scope: the 8th Wall engine binary and the Spline runtime (report those to Niantic Spatial and Spline), and denial of service by volume.
