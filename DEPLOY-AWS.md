# Gate Pass — First-time AWS deploy (step by step)

This guide assumes you have never used AWS before.
You only need your manager’s **username + password** to open the AWS website.
You do **not** put that username/password into the app or into any `.env` file.

```
Your browser  →  AWS Console (login with manager account)
                      ↓
                 EC2 server (virtual computer)
                      ↓
            Docker runs UI (port 80) + API (port 4000)
                      ↓
                 Neon Postgres (database you already have)
```

---

## Before you start (checklist)

| Item | Notes |
|------|--------|
| Manager AWS username + password | Used **only** in the browser to log in |
| Neon `DATABASE_URL` | From `gatepass-backend/.env` on your PC |
| This project’s Docker files on GitHub | See **Part A** below — required |
| Windows PC with PowerShell | For SSH into the server |
| Permission from manager | Creating an EC2 instance costs money (~$10–15/month for `t3.small`) |

---

## Part A — Push deploy files to GitHub (do this on your PC first)

The Docker files must be on GitHub before the server can download them.

1. In Cursor / your project, make sure these exist:
   - `Dockerfile`
   - `docker-compose.aws.yml`
   - `.env.aws.example`
   - `gatepass-backend/Dockerfile`
   - `DEPLOY-AWS.md`
2. **Commit and push** to GitHub (ask me to commit if you want, or do it yourself).
3. Confirm which GitHub URL you will clone on the server, for example:
   - `https://github.com/Ummehani2002/gatepass_system.git`
   - or `https://github.com/azarjinna93-create/gatepass_system.git`

If the server clones an old repo without Docker files, deploy will fail.

Also make sure the database is ready (on your PC, once):

```powershell
cd d:\gatepass_system\gatepass-backend
npm install
npm run db:setup
npm run db:seed
```

Login users after seed: `admin` / `admin123` and `garden` / `garden123`.

---

## Part B — Log in to AWS (browser only)

1. Open: [https://console.aws.amazon.com](https://console.aws.amazon.com)
2. Enter the **username** and **password** your manager gave you.
3. After login, look at the **top-right** corner — check the **region**.
   - Prefer **Asia Pacific (Mumbai) `ap-south-1`** if your users are in UAE/India area,
     or **US East (N. Virginia) `us-east-1`** if that is what the account already uses.
   - Stay on the **same region** for every step below.
4. In the top search bar, type **EC2** → click **EC2**.

> Your AWS password stays in your head / password manager.
> Never paste it into `.env`, GitHub, Discord, or this chat.

---

## Part C — Create a key pair (download once)

This file is how your PC logs into the server. It is **not** the AWS account password.

1. In the EC2 left menu → **Network & Security** → **Key Pairs**.
2. Click **Create key pair**.
3. Settings:
   - Name: `gatepass-key`
   - Key pair type: **RSA**
   - Private key file format: **`.pem`** (for Windows OpenSSH / PowerShell)
4. Click **Create key pair**.
5. A file `gatepass-key.pem` downloads.  
   Move it somewhere safe, for example:
   `C:\Users\Umme Hani\Downloads\gatepass-key.pem`
6. Do **not** share this file. Do **not** commit it to GitHub.

---

## Part D — Launch the EC2 server (virtual computer)

1. EC2 left menu → **Instances** → **Launch instances**.
2. Fill in each section:

### Name
- Name: `gatepass`

### Application and OS Images (AMI)
- Choose **Amazon Linux**
- Select **Amazon Linux 2023 AMI** (Free tier eligible if shown)

### Instance type
- Choose **t3.small** (recommended)  
  or **t3.micro** if you must stay cheaper / free-tier style

### Key pair (login)
- Select **gatepass-key** (the one you just created)

### Network settings — click **Edit**
- Auto-assign public IP: **Enable**
- Firewall (security groups): **Create security group**
- Security group name: `gatepass-sg`
- Add these **Inbound rules** (three rules):

| Type | Port | Source | Why |
|------|------|--------|-----|
| SSH | 22 | My IP | So only you can log in from your PC |
| HTTP | 80 | Anywhere-IPv4 (`0.0.0.0/0`) | So users open the website |
| Custom TCP | 4000 | Anywhere-IPv4 (`0.0.0.0/0`) | So the browser can call the API |

### Storage
- 20 GiB, **gp3** is fine

3. Click **Launch instance**.
4. Click **View all instances**.
5. Wait until **Instance state** = **Running** and **Status check** = **2/2 checks passed** (1–2 minutes).
6. Select the instance → copy **Public IPv4 address**  
   Example: `54.123.45.67`  
   You will use this IP everywhere below. Call it `YOUR_IP`.

---

## Part E — Connect from your Windows PC (SSH)

1. Open **PowerShell**.
2. Fix key permissions (Windows often requires this):

```powershell
icacls "C:\Users\Umme Hani\Downloads\gatepass-key.pem" /inheritance:r
icacls "C:\Users\Umme Hani\Downloads\gatepass-key.pem" /grant:r "$($env:USERNAME):(R)"
```

3. Connect (replace the IP and path if different):

```powershell
ssh -i "C:\Users\Umme Hani\Downloads\gatepass-key.pem" ec2-user@YOUR_IP
```

4. First time it asks `Are you sure you want to continue connecting?` → type `yes` → Enter.
5. You should see a Linux prompt like `[ec2-user@ip-... ~]$`.  
   You are now **inside** the AWS server.

If SSH fails:
- Wrong IP → copy Public IPv4 again from EC2
- Security group missing SSH / not “My IP”
- Wrong key file
- Instance not Running yet

---

## Part F — Install Docker on the server

Run these commands **on the EC2 server** (after SSH):

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
exit
```

SSH again (same PowerShell command as Part E), then:

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

You should see a version number (for example `Docker Compose version v2.32.4`).

---

## Part G — Download the app and put secrets (on the server)

Still on EC2:

```bash
cd ~
git clone https://github.com/Ummehani2002/gatepass_system.git
cd gatepass_system
```

> If your code is on the other GitHub remote, use that URL instead.
> After clone, confirm these files exist:
> `ls Dockerfile docker-compose.aws.yml .env.aws.example gatepass-backend/Dockerfile`

Create the secrets file:

```bash
cp .env.aws.example .env.aws
nano .env.aws
```

Edit so it looks like this (use your real values):

```env
POSTGRES_PASSWORD=pick-a-strong-password
JWT_SECRET=pick-a-long-random-secret-here
NEXT_PUBLIC_APP_URL=http://YOUR_IP
NEXT_PUBLIC_API_URL=http://YOUR_IP:4000
CORS_ORIGIN=http://YOUR_IP
```

Replace `YOUR_IP` with the real Public IPv4 (example `http://54.123.45.67`).

How to save in `nano`:
1. `Ctrl + O` → Enter (save)
2. `Ctrl + X` (exit)

**Where do credentials go?**

| Credential | Where it goes |
|------------|----------------|
| Manager AWS username/password | Browser login only — nowhere in files |
| `gatepass-key.pem` | Your PC Downloads — used only for SSH |
| `POSTGRES_PASSWORD` / `JWT_SECRET` | Server file `~/gatepass_system/.env.aws` |
| Public IP URLs | Same `.env.aws` file |

> Database runs as a Docker Postgres container on the same EC2 (volume `gatepass_pgdata`).
> Neon is optional and not required for AWS deploy.

---

## Part H — Build and start the app

On EC2, inside `~/gatepass_system`:

```bash
docker compose -f docker-compose.aws.yml --env-file .env.aws up -d --build
```

First build can take **5–15 minutes**. Wait until it finishes.

**First time only** (create empty DB + admin login):

```bash
docker compose -f docker-compose.aws.yml --env-file .env.aws exec api node scripts/setup.js
docker compose -f docker-compose.aws.yml --env-file .env.aws exec api node scripts/seed-users-only.js
```

Check status:

```bash
docker compose -f docker-compose.aws.yml ps
curl http://127.0.0.1:4000/api/health
```

Expected health response:

```json
{"ok":true,"db":"up"}
```

---

## Part I — Open the website

On your PC browser:

1. UI: `http://YOUR_IP`
2. API check: `http://YOUR_IP:4000/api/health`
3. Log in: `admin` / `admin123`
4. Create a gate pass to confirm it works

---

## Part J — Later updates (redeploy)

When you change code and push to GitHub:

```bash
ssh -i "C:\Users\Umme Hani\Downloads\gatepass-key.pem" ec2-user@YOUR_IP
cd ~/gatepass_system
git pull
docker compose -f docker-compose.aws.yml --env-file .env.aws up -d --build
```

If you change the public IP or domain, update `.env.aws` and rebuild (especially `NEXT_PUBLIC_*`).

---

## Common problems

| Problem | What to do |
|---------|------------|
| Cannot log into AWS Console | Wrong username/password; ask manager to reset / confirm account type (root vs IAM) |
| Instance stuck Pending | Wait 1–2 minutes; refresh |
| SSH `Permission denied (publickey)` | Wrong `.pem`, or not `ec2-user`, or wrong instance |
| SSH timeout | Security group: add SSH from **My IP**; check instance is Running |
| Website not loading | Security group must allow port **80**; containers running? (`docker compose ps`) |
| `db:"down"` | Wrong `DATABASE_URL` in `.env.aws`; fix and rebuild/restart |
| Login / CORS errors | `CORS_ORIGIN` must exactly match `http://YOUR_IP` (no trailing slash) |
| Clone has no Dockerfile | Deploy files not pushed to GitHub yet (do Part A) |

---

## Cost / safety notes for using a manager account

- Tell your manager you are launching **one EC2** instance named `gatepass`.
- Prefer they create an **IAM user** for you later (safer than sharing root password).
- When finished testing, you can **Stop** the instance (pauses most compute cost) or **Terminate** (deletes it).
- Never commit `.env.aws` or the `.pem` key to GitHub.
