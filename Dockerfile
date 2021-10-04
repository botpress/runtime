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
  # TODO: update the package script to output a zip without the version inside the filename
  unzip /app/packages/runtime/archives/runtime-v12_26_3-linux-x64 -d outputs 

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
