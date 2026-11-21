FROM docker:27-cli

RUN apk add --no-cache coreutils

COPY updater/update.sh /usr/local/bin/update.sh
RUN chmod +x /usr/local/bin/update.sh

ENTRYPOINT ["/usr/local/bin/update.sh"]
