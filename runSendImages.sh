#!/usr/bin/sh

pm2 start sendImages_0.js --name sendImages_0
pm2 start sendImages_1.js --name sendImages_1
pm2 start sendImages_2.js --name sendImages_2
