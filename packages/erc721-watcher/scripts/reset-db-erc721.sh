#!/usr/bin/env bash

echo WARNING: This will reset all the databases used by the erc721-watcher.
read -p "Do you want to continue? (y/n)" choice
if [[ $choice =~ ^(Y|y| ) ]]
then
  sudo -i -u postgres bash << EOF
  export PGPASSWORD=postgres

  dropdb erc721-watcher

  createdb erc721-watcher

  psql -d erc721-watcher-job-queue -c "delete from pgboss.job;"
EOF
else
  echo "Abort."
fi
