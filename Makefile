.PHONY: dev build start lint fix type-check install clean

dev:
	npm run dev

build:
	npm run build

start:
	npm run start

lint:
	npm run lint

fix:
	npx eslint --fix src/

type-check:
	npm run type-check

install:
	npm install

clean:
	rm -rf .next
