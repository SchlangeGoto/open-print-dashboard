FROM docker:27-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c # 27-cli

RUN apk add --no-cache coreutils

COPY updater/update.sh /usr/local/bin/update.sh
RUN chmod +x /usr/local/bin/update.sh

ENTRYPOINT ["/usr/local/bin/update.sh"]
