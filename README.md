# URATISATION

Shoot’em up 2D pour navigateur créé pour la team de scantrad Blue Flower.
Sa direction artistique repose sur des décors entièrement dessinés en 2D,
un pixel art fantasy détaillé et une magie florale bleue propre à la team.

## Développement

Prérequis : Node.js 24 et npm.

```bash
npm install
npm run dev
```

Le prototype accepte ZQSD, WASD, les flèches, la souris et le tactile.

## Cible Discord

La cible peut être injectée dans l'URL avec deux paramètres :

```text
?target=NomDuMembre&avatar=https://cdn.discordapp.com/avatars/...
```

- `target` définit le nom affiché au-dessus de la barre de vie ;
- `avatar` définit la photo de profil utilisée comme boss.

Sans ces paramètres, le jeu affiche une cible de démonstration avec une
initiale. À terme, le bot Lucifer générera automatiquement cette URL pour chaque
dossier d'uratisation.

## Production

```bash
npm run build
npm run preview
```

Le workflow GitHub Actions publie automatiquement le contenu de `dist` sur
GitHub Pages après chaque modification de la branche `main`.

## Sécurité

Le site GitHub Pages est entièrement public. Aucun token Discord, mot de passe,
secret serveur ou identifiant de base de données ne doit être ajouté à ce dépôt.
