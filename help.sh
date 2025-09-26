sudo certbot certonly --standalone \
  -d nomadnet.shop \
  -d www.nomadnet.shop \
  -d sellers.nomadnet.shop \
  -d admin.nomadnet.shop \
  --email support@nomadnet.com \
  --agree-tos \
  --non-interactive