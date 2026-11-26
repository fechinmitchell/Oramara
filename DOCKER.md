<!-- oramara/DOCKER.md -->
# Run Oramara on your Mac with Docker

This runs the database, the backend and the website with the admin on your own Mac. Nothing is paid for and nothing is online: it only works while Docker is running and only on your Mac. Later the backend can move to Render using render.yaml.

## One time setup

1. Install Docker Desktop for Mac from docker.com/products/docker-desktop and open it once so it finishes setting up.
2. Open Terminal and go to the Oramara folder, for example:
   `cd ~/Oramara`
3. Make your settings file:
   `cp .env.example .env`
4. Make a secret for logins:
   `openssl rand -hex 48`
   Copy what it prints.
5. Open the settings file with `open -e .env` and fill in:
   * JWT_SECRET: paste the secret from step 4
   * ADMIN_EMAIL and ADMIN_PASSWORD: the login you want for the admin (password of 10 characters or more)
   * ANTHROPIC_API_KEY and the two CDSE keys if you have them (leave empty to skip reports or satellite data)
   Save and close.

## Start it

Open Docker Desktop, then in Terminal in the Oramara folder:

`docker compose up -d --build`

The first start takes a few minutes. After that it is quick.

Then open http://localhost:5173/admin and log in with your ADMIN_EMAIL and ADMIN_PASSWORD. The website itself is at http://localhost:5173.

## Stop it

`docker compose down`

Your leads, reports and logins are kept. Next time just run the start command again. You can also quit Docker Desktop.

## Good to know

* Changed something in .env or pulled new code? Run the start command again and it picks it up.
* Something not working? See what the backend says with `docker compose logs backend`
* The ADMIN_PASSWORD is only used the first time. After that change your password in the admin under Account.
* To wipe everything and start fresh (this deletes all your data): `docker compose down -v`
* The live site at oramara.vercel.app cannot reach your Mac, so use the admin at localhost while you run it this way.
* Do not run this at the same time as `npm run dev`, since both use the same ports.
