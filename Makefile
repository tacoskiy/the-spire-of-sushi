FRONTEND_CONTAINER = client

.PHONY: build up down bash

build: 
	docker-compose up --build --remove-orphans

up: 
	docker-compose up -d

down:
	docker-compose down

bash:
	docker-compose exec $(FRONTEND_CONTAINER) bash