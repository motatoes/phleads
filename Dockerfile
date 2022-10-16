FROM node:16

COPY . .

RUN npm install
RUN npm install pm2 -g
EXPOSE 3000

CMD ["pm2", "start", "server.js", "--no-daemon"]
