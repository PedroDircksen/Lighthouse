FROM node:20.9.0 AS base

# Volta pro diretório do back
WORKDIR /app
COPY ./package*.json ./

RUN npm install
RUN apt-get install -y wget
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
RUN echo "deb http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list
RUN apt-get update && apt-get -y install google-chrome-stable

# Copia o código do back
COPY ./ ./

# Copia o env do back
COPY ./settings.env ./settings.env

EXPOSE 3001
ENV PORT 3001
ENV HOSTNAME "0.0.0.0"

USER root

CMD ["npm", "run", "start-prod"]
