FROM ubuntu:20.04 as build

RUN apt update && apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates bash unzip
RUN curl -sL https://deb.nodesource.com/setup_12.x | bash -
RUN apt -y install nodejs gcc g++ make 
RUN npm install --global yarn

WORKDIR /app
COPY . /app
RUN yarn install
RUN yarn build
RUN yarn package

RUN mkdir outputs && \
  unzip /app/packages/runtime/archives/runtime-v*-linux-x64.zip -d outputs 

FROM ubuntu:20.04

WORKDIR /botpress

RUN apt update && \
	apt install -y wget ca-certificates && \
  update-ca-certificates && \
  chgrp -R 0 /botpress && \
	chmod -R g=u /botpress && \
	apt install -y tzdata && \
  ln -fs /usr/share/zoneinfo/UTC /etc/localtime && \
  dpkg-reconfigure --frontend noninteractive tzdata

COPY --from=build /app/outputs /botpress

ENV BP_IS_DOCKER=true
ENV LANG=C.UTF-8

EXPOSE 3000

ENTRYPOINT ["/botpress/runtime"]
