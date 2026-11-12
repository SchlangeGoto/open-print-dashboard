#!/usr/bin/env bash

set -e
set -x

# Tests delete rows. Never let that happen to the development database: require
# an explicit test database whose name ends in _test.
if [ -z "${TEST_DATABASE_URL:-}" ]; then
    echo "TEST_DATABASE_URL is not set. Example:" >&2
    echo "  export TEST_DATABASE_URL=postgresql://opd:changethis@localhost:5432/openprintdashboard_test" >&2
    exit 1
fi

case "${TEST_DATABASE_URL}" in
    *_test | *_test\?*) ;;
    *)
        echo "Refusing to run: TEST_DATABASE_URL must name a database ending in _test" >&2
        exit 1
        ;;
esac

export DATABASE_URL="${TEST_DATABASE_URL}"

coverage run -m pytest tests/
coverage report
coverage html --title "${@-coverage}"
