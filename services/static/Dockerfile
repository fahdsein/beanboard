FROM nginx:1.27-alpine
COPY services/static/nginx.conf /etc/nginx/conf.d/default.conf
COPY services/static/public /usr/share/nginx/html
EXPOSE 8080
