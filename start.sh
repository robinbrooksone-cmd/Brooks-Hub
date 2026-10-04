#!/bin/bash
export PATH="/Users/maricamarx/wedding-site/.tools/node-v20.18.1-darwin-arm64/bin:$PATH"
cd "/Users/maricamarx/wedding-site/site"
exec npm run start -- --port 3000
