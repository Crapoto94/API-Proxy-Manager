/**
 * Helpers LDAP partagés : recherche insensible aux accents et décodage des
 * chaînes renvoyées par le LDAP.
 *
 * Contexte : la recherche/vérification d'un agent AD échouait pour les
 * noms/prénoms accentués (ex. « Valérie Fourbe ») — l'octet exact envoyé
 * dans le filtre LDAP pour un caractère accentué ne correspond pas toujours
 * à celui stocké côté AD, et les valeurs renvoyées par ldapjs peuvent
 * arriver \XX-échappées. Même correction que celle appliquée dans
 * C:\dev\appdsi\backend\shared\{ad_helper,utils}.js : on ajoute une variante
 * « floue » du filtre (accents remplacés par « * ») en repli, et on
 * décode/normalise (NFC) les attributs texte des résultats.
 */

/** Échappe les caractères spéciaux d'un filtre LDAP (RFC 4515, forme hexadécimale). */
function escapeLDAPFilter(value) {
    return String(value)
        .replace(/\\/g, '\\5c')
        .replace(/\*/g, '\\2a')
        .replace(/\(/g, '\\28')
        .replace(/\)/g, '\\29')
        .replace(/\0/g, '\\00');
}

/**
 * Variante « floue » d'une valeur de recherche : les marques diacritiques
 * (accents) sont remplacées par un joker « * », déjà échappée pour un filtre
 * LDAP. Ex. « Valérie » → « Vale*rie » (le é se décompose en « e » + accent
 * combinant, remplacé par le joker).
 */
function fuzzyAccentLDAPValue(value) {
    const fuzzy = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '*');
    return escapeLDAPFilter(fuzzy);
}

/**
 * Décode une chaîne LDAP potentiellement échappée en \XX (octets UTF-8) et la
 * normalise en NFC, pour afficher correctement les caractères accentués.
 */
function decodeLDAPString(str) {
    if (!str) return str;
    if (Buffer.isBuffer(str)) return str.toString('utf8');
    if (typeof str !== 'string') return str;

    try {
        if (str.includes('\\')) {
            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                if (str[i] === '\\' && i + 2 < str.length && /[0-9a-fA-F]{2}/.test(str.substring(i + 1, i + 3))) {
                    bytes.push(parseInt(str.substring(i + 1, i + 3), 16));
                    i += 2;
                } else {
                    bytes.push(str.charCodeAt(i));
                }
            }
            return Buffer.from(bytes).toString('utf8').normalize('NFC');
        }
        return str.normalize('NFC');
    } catch (e) {
        return str;
    }
}

const DECODE_ATTRS = ['cn', 'displayName', 'name', 'memberOf', 'mail', 'title', 'department', 'sAMAccountName', 'givenName', 'sn', 'company', 'userPrincipalName'];

/** Décode/normalise en place les attributs texte usuels d'une entrée LDAP déjà aplatie en objet simple. */
function decodeEntryAttrs(obj) {
    if (!obj) return obj;
    DECODE_ATTRS.forEach((attr) => {
        if (obj[attr] === undefined || obj[attr] === null) return;
        obj[attr] = Array.isArray(obj[attr])
            ? obj[attr].map((v) => decodeLDAPString(v))
            : decodeLDAPString(obj[attr]);
    });
    return obj;
}

module.exports = {
    escapeLDAPFilter,
    fuzzyAccentLDAPValue,
    decodeLDAPString,
    decodeEntryAttrs
};
