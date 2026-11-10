/**
 * L'UNIQUE épinglage, côté site, du déploiement Convex de démonstration
 * (ADR-0029, ADR-0032). C'est une garde, pas une configuration : le chemin
 * `/demo` (`app-path.ts`) et la projection illustrative du catalogue
 * (`demo-catalog-projection.ts`) ne s'ouvrent que sur ce moteur précis, et
 * aucune variable de bascule n'autorise un autre hôte.
 *
 * Le dépôt est public (EX-20) : ce fichier est une exception nommée du cliquet
 * `no-deployment-identifiers`. Les tests importent ces constantes au lieu de
 * recopier le nom ; lire ce nom dans une variable élargirait ce qui ouvre la
 * démonstration, décision réservée au propriétaire.
 */
export const DEMO_DEPLOYMENT_NAME = "vivid-hedgehog-655"
export const DEMO_BACKEND_HOST = `${DEMO_DEPLOYMENT_NAME}.convex.cloud`
