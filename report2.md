Run # Pull the image we just built
50
latest: Pulling from ***/api-gateway
51
1074353eec0d: Pulling fs layer
52
c2b4197efb6c: Pulling fs layer
53
3dcec9142507: Pulling fs layer
54
41b3afaea3b1: Pulling fs layer
55
831a209505b1: Pulling fs layer
56
3dd88fa56efe: Pulling fs layer
57
059625798730: Pulling fs layer
58
7ad921074add: Pulling fs layer
59
862751bea16f: Pulling fs layer
60
503a2de110f4: Pulling fs layer
61
3dd88fa56efe: Waiting
62
059625798730: Waiting
63
7ad921074add: Waiting
64
862751bea16f: Waiting
65
503a2de110f4: Waiting
66
41b3afaea3b1: Waiting
67
831a209505b1: Waiting
68
3dcec9142507: Verifying Checksum
69
3dcec9142507: Download complete
70
1074353eec0d: Verifying Checksum
71
1074353eec0d: Download complete
72
41b3afaea3b1: Verifying Checksum
73
41b3afaea3b1: Download complete
74
831a209505b1: Verifying Checksum
75
831a209505b1: Download complete
76
3dd88fa56efe: Verifying Checksum
77
3dd88fa56efe: Download complete
78
059625798730: Verifying Checksum
79
059625798730: Download complete
80
1074353eec0d: Pull complete
81
7ad921074add: Verifying Checksum
82
7ad921074add: Download complete
83
c2b4197efb6c: Verifying Checksum
84
c2b4197efb6c: Download complete
85
503a2de110f4: Verifying Checksum
86
503a2de110f4: Download complete
87
c2b4197efb6c: Pull complete
88
3dcec9142507: Pull complete
89
41b3afaea3b1: Pull complete
90
831a209505b1: Pull complete
91
3dd88fa56efe: Pull complete
92
059625798730: Pull complete
93
7ad921074add: Pull complete
94
862751bea16f: Verifying Checksum
95
862751bea16f: Download complete
96
862751bea16f: Pull complete
97
503a2de110f4: Pull complete
98
Digest: sha256:5cb8dbb63e56d1a7c6b53f649777a9e47857ec136dd7f8bbe8a5d78d2c2a88f2
99
Status: Downloaded newer image for ***/api-gateway:latest
100
docker.io/***/api-gateway:latest
101
0f296deea5594792fe578ea0323651fc9b99aa23d795d795fa31385f2b76ea32
102
❌ Container smoke-test-api-gateway exited unexpectedly
103
[api-gateway] Uncaught Exception: Error: Cannot find module '.prisma/client/default'
104
Require stack:
105
- /app/node_modules/.pnpm/@prisma+client@6.7.0_prisma@6.7.0_typescript@5.7.2__typescript@5.7.2/node_modules/@prisma/client/default.js
106
- /app/dist/main.js
107
    at Module._resolveFilename (node:internal/modules/cjs/loader:1207:15)
108
    at Module._load (node:internal/modules/cjs/loader:1038:27)
109
    at Module.require (node:internal/modules/cjs/loader:1289:19)
110
    at require (node:internal/modules/helpers:182:18)
111
    at Object.<anonymous> (/app/node_modules/.pnpm/@prisma+client@6.7.0_prisma@6.7.0_typescript@5.7.2__typescript@5.7.2/node_modules/@prisma/client/default.js:2:6)
112
    at Module._compile (node:internal/modules/cjs/loader:1521:14)
113
    at Module._extensions..js (node:internal/modules/cjs/loader:1623:10)
114
    at Module.load (node:internal/modules/cjs/loader:1266:32)
115
    at Module._load (node:internal/modules/cjs/loader:1091:12)
116
    at Module.require (node:internal/modules/cjs/loader:1289:19) {
117
  code: 'MODULE_NOT_FOUND',
118
  requireStack: [
119
    '/app/node_modules/.pnpm/@prisma+client@6.7.0_prisma@6.7.0_typescript@5.7.2__typescript@5.7.2/node_modules/@prisma/client/default.js',
120
    '/app/dist/main.js'
121
  ]
122
}
123
smoke-test-api-gateway
124
Error: Process completed with exit code 1.