Run # Pull the image we just built
38
latest: Pulling from ***/seller-ui
39
1074353eec0d: Pulling fs layer
40
c2b4197efb6c: Pulling fs layer
41
3dcec9142507: Pulling fs layer
42
41b3afaea3b1: Pulling fs layer
43
fad71d933aa0: Pulling fs layer
44
81dde917425a: Pulling fs layer
45
445dc7006c53: Pulling fs layer
46
876f8351a566: Pulling fs layer
47
b9ff46bad0f6: Pulling fs layer
48
69918285048a: Pulling fs layer
49
230d70df32dc: Pulling fs layer
50
41b3afaea3b1: Waiting
51
fad71d933aa0: Waiting
52
81dde917425a: Waiting
53
445dc7006c53: Waiting
54
876f8351a566: Waiting
55
b9ff46bad0f6: Waiting
56
69918285048a: Waiting
57
230d70df32dc: Waiting
58
3dcec9142507: Verifying Checksum
59
3dcec9142507: Download complete
60
1074353eec0d: Verifying Checksum
61
1074353eec0d: Download complete
62
41b3afaea3b1: Verifying Checksum
63
41b3afaea3b1: Download complete
64
fad71d933aa0: Verifying Checksum
65
fad71d933aa0: Download complete
66
c2b4197efb6c: Verifying Checksum
67
c2b4197efb6c: Download complete
68
1074353eec0d: Pull complete
69
81dde917425a: Verifying Checksum
70
81dde917425a: Download complete
71
445dc7006c53: Verifying Checksum
72
445dc7006c53: Download complete
73
69918285048a: Verifying Checksum
74
69918285048a: Download complete
75
b9ff46bad0f6: Verifying Checksum
76
b9ff46bad0f6: Download complete
77
230d70df32dc: Verifying Checksum
78
230d70df32dc: Download complete
79
c2b4197efb6c: Pull complete
80
3dcec9142507: Pull complete
81
41b3afaea3b1: Pull complete
82
fad71d933aa0: Pull complete
83
81dde917425a: Pull complete
84
445dc7006c53: Pull complete
85
876f8351a566: Verifying Checksum
86
876f8351a566: Download complete
87
876f8351a566: Pull complete
88
b9ff46bad0f6: Pull complete
89
69918285048a: Pull complete
90
230d70df32dc: Pull complete
91
Digest: sha256:f1fc9b21b8f4cd13d5ff797203ee53b511234f84902c77ba6b4967121c9a4489
92
Status: Downloaded newer image for ***/seller-ui:latest
93
docker.io/***/seller-ui:latest
94
22a89d3f9e8becd79783b9632c48356ffbed4c1c25c4f61d29efaed2994b4305
95
ReferenceError: document is not defined
96
 ⨯ unhandledRejection:  ReferenceError: document is not defined
97
❌ Container logs show errors
98
ReferenceError: document is not defined
99
   ▲ Next.js 15.1.11
100
    at <unknown> (.next/server/chunks/176.js:1:82585)
101
    at Array.forEach (<anonymous>)
102
    at 74530 (.next/server/chunks/176.js:1:82573)
103
    at t (.next/server/webpack-runtime.js:1:142)
104
    at 54102 (.next/server/chunks/564.js:1:6498)
105
    at t (.next/server/webpack-runtime.js:1:142)
106
    at 87356 (.next/server/app/(routes)/dashboard/create-event/page.js:1:3344)
107
    at Function.t (.next/server/webpack-runtime.js:1:142)
108
 ⨯ unhandledRejection:  ReferenceError: document is not defined
109
    at <unknown> (.next/server/chunks/176.js:1:82585)
110
    at Array.forEach (<anonymous>)
111
    at 74530 (.next/server/chunks/176.js:1:82573)
112
    at t (.next/server/webpack-runtime.js:1:142)
113
    at 54102 (.next/server/chunks/564.js:1:6498)
114
    at t (.next/server/webpack-runtime.js:1:142)
115
    at 87356 (.next/server/app/(routes)/dashboard/create-event/page.js:1:3344)
116
    at Function.t (.next/server/webpack-runtime.js:1:142)
117
   - Local:        http://localhost:3001
118
   - Network:      http://0.0.0.0:3001
119

120
 ✓ Starting...
121
 ✓ Ready in 72ms
122
smoke-test-seller-ui
123
Error: Process completed with exit code 1.