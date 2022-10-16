FROM node:16

COPY . .

RUN npm install
RUN npm i -g nodemon
EXPOSE 3000

CMD ["nodemon", "node", "server.js"]
