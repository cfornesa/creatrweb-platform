#!/bin/bash
set -e
npm ci
npm run push-force --workspace=@workspace/db
