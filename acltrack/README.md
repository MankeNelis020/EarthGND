# ACLTrack

Webapplicatie voor het bijhouden van ACL (voorste kruisband) revalidatiepatiënten in een fysiotherapiepraktijk.

## Vereisten

- Docker Engine 24+
- Docker Compose v2+

## Installatie

### 1. Repository klonen

```bash
git clone <repository-url>
cd acltrack
```

### 2. Omgevingsvariabelen instellen

```bash
cp .env.example .env
```

Open `.env` en vul in:

```bash
# Genereer een veilige JWT secret:
openssl rand -hex 64

# Plak de output als waarde voor JWT_SECRET in .env
# Stel ook FRONTEND_URL in op je domein, bijv.: https://acltrack.praktijk.nl
```

### 3. Applicatie starten

```bash
docker-compose up -d
```

### 4. Eerste login

Bezoek `http://localhost` in je browser.

- **Email:** `admin@praktijk.nl`
- **Wachtwoord:** `WijzigDitWachtwoord123!`

> ⚠️ **Wijzig dit wachtwoord direct na de eerste login** via Beheer → Wachtwoord wijzigen.

### 5. Medewerkers aanmaken

Ga naar **Beheer** (alleen zichtbaar als admin) en klik op **Nieuwe medewerker**. Stel naam, e-mail, tijdelijk wachtwoord en rol in.

## SSL/HTTPS

Plaats je SSL-certificaten in de `ssl/` map:

```bash
ssl/
├── cert.pem    # SSL certificaat (of fullchain.pem van Let's Encrypt)
└── key.pem     # Privésleutel
```

Vervolgens in `nginx.conf`: verwijder het commentaar bij de redirect-regel in het HTTP-blok (`return 301 https://...`).

Voor Let's Encrypt (Certbot):

```bash
certbot certonly --standalone -d jouwdomein.nl
cp /etc/letsencrypt/live/jouwdomein.nl/fullchain.pem ssl/cert.pem
cp /etc/letsencrypt/live/jouwdomein.nl/privkey.pem ssl/key.pem
docker-compose restart nginx
```

## Backup

De database wordt opgeslagen in `./data/acltrack.db`. Maak dagelijks een backup:

```bash
cp data/acltrack.db backup/acltrack_$(date +%Y%m%d).db
```

Of automatisch via cron:

```bash
# Elke dag om 02:00 backup maken
0 2 * * * cp /pad/naar/acltrack/data/acltrack.db /pad/naar/backup/acltrack_$(date +\%Y\%m\%d).db
```

## Updates

```bash
git pull
docker-compose build
docker-compose up -d
```

## AVG / Privacy

- Er wordt **geen BSN** of andere bijzondere persoonsgegevens opgeslagen
- Alle acties worden bijgehouden in een **audit log** (tabel `audit_log`)
- Gegevens worden alleen toegankelijk gemaakt na authenticatie met JWT
- Wachtwoorden worden opgeslagen als bcrypt hash (rounds: 12)
- De database staat lokaal op je eigen server — geen data naar externe diensten

## Architectuur

```
nginx (poort 80/443)
├── /api/* → backend (Node.js + Express + SQLite)
└── /*     → frontend (React + Vite, geserveerd via nginx)
```

## Standaard accounts

| Email | Wachtwoord | Rol |
|-------|-----------|-----|
| admin@praktijk.nl | WijzigDitWachtwoord123! | admin |

> Verwijder of wijzig dit account na ingebruikname.
