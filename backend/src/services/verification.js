/**
 * Service de vérification des pseudos et gamertags
 */

// ==========================================
// TWITCH VERIFICATION
// ==========================================

/**
 * Vérifie si un pseudo Twitch existe
 * Utilise l'API Helix de Twitch
 */
export async function verifyTwitchUsername(username) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  // Si pas de credentials Twitch, on fait une vérification basique
  if (!clientId || !clientSecret) {
    console.log('Twitch API non configurée, vérification basique...');
    return await verifyTwitchBasic(username);
  }

  try {
    // Obtenir un token d'accès
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      })
    });

    if (!tokenResponse.ok) {
      console.error('Erreur token Twitch:', await tokenResponse.text());
      return await verifyTwitchBasic(username);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Chercher l'utilisateur
    const userResponse = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`,
      {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      console.error('Erreur API Twitch:', await userResponse.text());
      return await verifyTwitchBasic(username);
    }

    const userData = await userResponse.json();

    if (userData.data && userData.data.length > 0) {
      const user = userData.data[0];
      return {
        valid: true,
        exists: true,
        username: user.login,
        displayName: user.display_name,
        profileImage: user.profile_image_url,
        verified: true
      };
    } else {
      return {
        valid: false,
        exists: false,
        error: 'Ce pseudo Twitch n\'existe pas'
      };
    }
  } catch (error) {
    console.error('Erreur vérification Twitch:', error);
    return await verifyTwitchBasic(username);
  }
}

/**
 * Vérification basique Twitch (sans API)
 * Essaie d'accéder à la page du channel
 */
async function verifyTwitchBasic(username) {
  try {
    // Nettoyer le username
    const cleanUsername = username.replace('@', '').trim().toLowerCase();

    // Vérifier le format
    if (!/^[a-z0-9_]{4,25}$/.test(cleanUsername)) {
      return {
        valid: false,
        exists: false,
        error: 'Format invalide (4-25 caractères, lettres/chiffres/_)'
      };
    }

    // Essayer de fetch la page Twitch
    const response = await fetch(`https://www.twitch.tv/${cleanUsername}`, {
      method: 'HEAD',
      redirect: 'follow'
    });

    // Si la page existe et ne redirige pas vers la page d'accueil
    if (response.ok) {
      return {
        valid: true,
        exists: true,
        username: cleanUsername,
        verified: false, // Non vérifié via API
        note: 'Vérification basique - configurer TWITCH_CLIENT_ID pour vérification complète'
      };
    } else {
      return {
        valid: false,
        exists: false,
        error: 'Ce pseudo Twitch semble ne pas exister'
      };
    }
  } catch (error) {
    console.error('Erreur vérification Twitch basique:', error);
    // En cas d'erreur, on accepte mais non vérifié
    return {
      valid: true,
      exists: null,
      verified: false,
      note: 'Impossible de vérifier - accepté provisoirement'
    };
  }
}

// ==========================================
// XBOX GAMERTAG VERIFICATION
// ==========================================

/**
 * Vérifie si un gamertag Xbox existe
 * Note: Nécessite Xbox Live API (déjà implémenté via OAuth)
 */
export async function verifyXboxGamertag(gamertag) {
  // La vérification Xbox se fait via OAuth Microsoft
  // On fait juste une validation de format ici

  const cleanGamertag = gamertag.trim();

  // Format Xbox Gamertag: 1-15 caractères, lettres, chiffres, espaces simples
  if (cleanGamertag.length < 1 || cleanGamertag.length > 15) {
    return {
      valid: false,
      error: 'Le gamertag doit faire entre 1 et 15 caractères'
    };
  }

  // Pas de caractères spéciaux sauf espaces
  if (!/^[a-zA-Z0-9 ]+$/.test(cleanGamertag)) {
    return {
      valid: false,
      error: 'Le gamertag ne peut contenir que des lettres, chiffres et espaces'
    };
  }

  // Pas d'espaces consécutifs
  if (/  /.test(cleanGamertag)) {
    return {
      valid: false,
      error: 'Le gamertag ne peut pas avoir d\'espaces consécutifs'
    };
  }

  return {
    valid: true,
    gamertag: cleanGamertag,
    verified: false,
    note: 'Connecte ton compte Microsoft pour vérifier'
  };
}

// ==========================================
// PSN ID VERIFICATION
// ==========================================

/**
 * Vérifie le format d'un PSN ID
 * Note: Pas d'API publique Sony, validation de format uniquement
 */
export async function verifyPsnId(psnId) {
  const cleanId = psnId.trim();

  // Format PSN: 3-16 caractères, commence par lettre, lettres/chiffres/-/_
  if (cleanId.length < 3 || cleanId.length > 16) {
    return {
      valid: false,
      error: 'Le PSN ID doit faire entre 3 et 16 caractères'
    };
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(cleanId)) {
    return {
      valid: false,
      error: 'Le PSN ID doit commencer par une lettre et contenir uniquement lettres, chiffres, - ou _'
    };
  }

  return {
    valid: true,
    psnId: cleanId,
    verified: false,
    note: 'Vérification manuelle requise (pas d\'API Sony publique)'
  };
}

// ==========================================
// EA ID VERIFICATION
// ==========================================

/**
 * Vérifie le format d'un EA ID
 * Note: Pas d'API publique EA, validation de format uniquement
 */
export async function verifyEaId(eaId) {
  const cleanId = eaId.trim();

  // Format EA ID: 4-16 caractères
  if (cleanId.length < 4 || cleanId.length > 16) {
    return {
      valid: false,
      error: 'L\'EA ID doit faire entre 4 et 16 caractères'
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
    return {
      valid: false,
      error: 'L\'EA ID ne peut contenir que lettres, chiffres, - ou _'
    };
  }

  return {
    valid: true,
    eaId: cleanId,
    verified: false,
    note: 'Vérification manuelle requise (pas d\'API EA publique)'
  };
}

// ==========================================
// STEAM VERIFICATION
// ==========================================

/**
 * Vérifie si un profil Steam existe
 * Utilise l'API Steam (publique) ou vérifie la page de profil
 */
export async function verifySteamName(steamName) {
  const cleanName = steamName.trim();

  // Vérifier le format
  if (cleanName.length < 2 || cleanName.length > 32) {
    return {
      valid: false,
      error: 'Le nom Steam doit faire entre 2 et 32 caractères'
    };
  }

  const steamApiKey = process.env.STEAM_API_KEY;

  if (steamApiKey) {
    try {
      // Essayer de résoudre le vanity URL
      const response = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${steamApiKey}&vanityurl=${encodeURIComponent(cleanName)}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.response.success === 1) {
          return {
            valid: true,
            exists: true,
            steamId: data.response.steamid,
            verified: true
          };
        }
      }
    } catch (error) {
      console.error('Erreur API Steam:', error);
    }
  }

  // Vérification basique via la page de profil
  try {
    const response = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(cleanName)}`, {
      method: 'HEAD',
      redirect: 'follow'
    });

    if (response.ok && !response.url.includes('search')) {
      return {
        valid: true,
        exists: true,
        steamName: cleanName,
        verified: false,
        note: 'Profil trouvé (configurer STEAM_API_KEY pour vérification complète)'
      };
    }
  } catch (error) {
    console.error('Erreur vérification Steam:', error);
  }

  return {
    valid: true,
    exists: null,
    steamName: cleanName,
    verified: false,
    note: 'Impossible de vérifier - accepté provisoirement'
  };
}

// ==========================================
// NINTENDO ID VERIFICATION
// ==========================================

/**
 * Vérifie le format d'un Nintendo ID
 * Note: Pas d'API publique Nintendo
 */
export async function verifyNintendoId(nintendoId) {
  const cleanId = nintendoId.trim();

  // Format Nintendo: variable selon le service
  if (cleanId.length < 1 || cleanId.length > 20) {
    return {
      valid: false,
      error: 'Le Nintendo ID doit faire entre 1 et 20 caractères'
    };
  }

  return {
    valid: true,
    nintendoId: cleanId,
    verified: false,
    note: 'Vérification manuelle requise (pas d\'API Nintendo publique)'
  };
}

// ==========================================
// VERIFY ALL
// ==========================================

/**
 * Vérifie tous les gamertags fournis
 */
export async function verifyAllGamertags(gamertags) {
  const results = {};

  if (gamertags.twitchUsername) {
    results.twitch = await verifyTwitchUsername(gamertags.twitchUsername);
  }

  if (gamertags.xboxGamertag) {
    results.xbox = await verifyXboxGamertag(gamertags.xboxGamertag);
  }

  if (gamertags.psnId) {
    results.psn = await verifyPsnId(gamertags.psnId);
  }

  if (gamertags.eaId) {
    results.ea = await verifyEaId(gamertags.eaId);
  }

  if (gamertags.steamName) {
    results.steam = await verifySteamName(gamertags.steamName);
  }

  if (gamertags.nintendoId) {
    results.nintendo = await verifyNintendoId(gamertags.nintendoId);
  }

  // Vérifier si tous sont valides
  const allValid = Object.values(results).every(r => r.valid);

  return {
    allValid,
    results
  };
}

export default {
  verifyTwitchUsername,
  verifyXboxGamertag,
  verifyPsnId,
  verifyEaId,
  verifySteamName,
  verifyNintendoId,
  verifyAllGamertags
};
