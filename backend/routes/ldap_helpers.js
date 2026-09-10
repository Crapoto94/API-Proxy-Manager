/**
 * Helpers LDAP partagés (échappement de filtre, recherche insensible aux accents,
 * décodage des chaînes retournées par le LDAP).
 *
 * Contexte : la recherche/vérification d'un agent AD échouait pour les noms/prénoms
 * accentués (ex. « Valérie Fourbe ») — l'octet exact envoyé dans le filtre LDAP pour
 * un caractère accentué ne correspond pas toujours à celui stocké côté AD, et les
 * valeurs renvoyées par ldapjs peuvent arriver \XX-échappées. Même correction que
 * celle appliquée dans C:\dev\appdsi\backend\shared\{ad_helper,utils}.js : on
 * échappe le filtre, on ajoute une variante « floue » (accents remplacés par « * »)
 * en repli, et on décode/normalise (NFC) les attributs texte des résultats.
 */

/** Échappe les caractères spéciaux d'un filtre LDAP (RFC 4515). */
function escapeLDAPFilter(value) {
    return String(value).replace(/[*()\\\x00]/g, '\\$&');
}

/**
 * Variante « floue » d'une valeur de recherche : les marques diacritiques
 * (accents) sont remplacées par un joker « * », déjà échappée pour un filtre LDAP.
 * Ex. « Valérie » → « Vale*rie » (le é se décompose en e + combining acute).
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

/** Aplati une entrée LDAP (ldapjs 3.x) en objet simple, en décodant les attributs texte usuels. */
function flattenLDAPEntry(entry) {
    if (!entry) return null;
    const pojo = entry.pojo;
    if (!pojo) return entry.object || entry;

    let rawDn = pojo.objectName || '';
    try {
        if (rawDn && typeof rawDn === 'string' && rawDn.includes('\\')) rawDn = decodeLDAPString(rawDn);
    } catch (e) { /* ignore */ }

    const obj = { dn: rawDn };
    if (pojo.attributes && Array.isArray(pojo.attributes)) {
        pojo.attributes.forEach((attr) => {
            let val = attr.values.length === 1 ? attr.values[0] : attr.values;
            if (DECODE_ATTRS.includes(attr.type)) {
                val = Array.isArray(val) ? val.map((v) => decodeLDAPString(v)) : decodeLDAPString(val);
            }
            obj[attr.type] = val;
        });
    }
    return obj;
}

/**
 * Filtre LDAP « OR » combinant, pour chaque attribut donné, un match partiel sur
 * la valeur brute ET sur sa variante floue (accents → « * »), pour retrouver les
 * agents accentués quelle que soit la façon dont l'accent est stocké côté AD.
 */
function buildAccentInsensitiveOrFilter(attributes, rawValue) {
    const escaped = escapeLDAPFilter(rawValue);
    const fuzzy = fuzzyAccentLDAPValue(rawValue);
    const clauses = attributes.map((attr) => `(${attr}=*${escaped}*)`);
    if (fuzzy !== escaped) {
        attributes.forEach((attr) => clauses.push(`(${attr}=*${fuzzy}*)`));
    }
    return `(|${clauses.join('')})`;
}

module.exports = {
    escapeLDAPFilter,
    fuzzyAccentLDAPValue,
    decodeLDAPString,
    flattenLDAPEntry,
    buildAccentInsensitiveOrFilter
};
