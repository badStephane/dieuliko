-include .env
export

.PHONY: db-up db-down migrate seed admin run generate test test-short cover lint

db-up: ## Start PostgreSQL (port 5433) and Mailpit (SMTP 1025, UI http://localhost:8025)
	docker compose -f ../../docker-compose.yml up -d --wait postgres mailpit

db-down:
	docker compose -f ../../docker-compose.yml down

migrate: ## Apply migrations
	go run ./cmd/migrate up

seed: ## Import data/companies_scraped.json
	go run ./cmd/seed

admin: ## Create an administrator: make admin EMAIL=... FIRST=... LAST=... (password prompted)
	go run ./cmd/admin create -email "$(EMAIL)" -first "$(FIRST)" -last "$(LAST)"

run: ## Start the API on HTTP_ADDR
	go run ./cmd/api

generate: ## Regenerate sqlc code after editing migrations or queries
	sqlc generate

test: ## All tests, including PostgreSQL integration tests (needs Docker)
	go test -race ./...

test-short: ## Unit tests only
	go test -race -short ./...

cover:
	go test -race -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | tail -1

lint:
	go vet ./...
