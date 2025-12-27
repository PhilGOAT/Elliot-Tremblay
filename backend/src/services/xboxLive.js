import axios from 'axios';

// Configuration Xbox Live API
const XBOX_CONFIG = {
  clientId: process.env.XBOX_CLIENT_ID,
  clientSecret: process.env.XBOX_CLIENT_SECRET,
  // Le redirect doit correspondre exactement à ce qui est configuré dans Azure Portal
  redirectUri: process.env.XBOX_REDIRECT_URI || 'https://elliot-frontend-production.up.railway.app/profile',
  // Scopes pour Microsoft Graph (XboxLive.signin requiert approbation spéciale)
  scopes: 'openid profile email User.Read offline_access'
};

// URLs Microsoft/Xbox (Azure AD v2.0 pour comptes personnels)
const URLS = {
  authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  xboxAuth: 'https://user.auth.xboxlive.com/user/authenticate',
  xstsAuth: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  profile: 'https://profile.xboxlive.com/users/me/profile/settings'
};

/**
 * Génère l'URL d'autorisation OAuth pour Xbox Live
 */
export function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: XBOX_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: XBOX_CONFIG.redirectUri,
    scope: XBOX_CONFIG.scopes,
    state: state,
    // Forcer l'écran de sélection de compte (évite passkey)
    prompt: 'select_account'
  });

  return `${URLS.authorize}?${params.toString()}`;
}

/**
 * Échange le code d'autorisation contre un token d'accès
 */
export async function exchangeCodeForToken(code) {
  try {
    const response = await axios.post(URLS.token, new URLSearchParams({
      client_id: XBOX_CONFIG.clientId,
      client_secret: XBOX_CONFIG.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: XBOX_CONFIG.redirectUri
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data;
  } catch (error) {
    console.error('Xbox token exchange error:', error.response?.data || error.message);
    throw new Error('Échec de l\'authentification Xbox');
  }
}

/**
 * Authentifie avec Xbox Live en utilisant le token Microsoft
 */
export async function authenticateWithXboxLive(accessToken) {
  try {
    // Étape 1: Obtenir le token Xbox Live
    const xblResponse = await axios.post(URLS.xboxAuth, {
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${accessToken}`
      }
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const xblToken = xblResponse.data.Token;
    const userHash = xblResponse.data.DisplayClaims.xui[0].uhs;
    const gamertag = xblResponse.data.DisplayClaims.xui[0].gtg;
    const xuid = xblResponse.data.DisplayClaims.xui[0].xid;

    // Retourner directement les infos du XBL token (plus simple, moins de restrictions)
    return {
      xblToken,
      userHash,
      xuid: xuid || userHash,
      gamertag: gamertag || 'Xbox User'
    };
  } catch (error) {
    console.error('Xbox Live auth error:', error.response?.data || error.message);
    // Fallback: retourner null pour utiliser le profil Microsoft à la place
    return null;
  }
}

/**
 * Obtient le profil Microsoft Graph (fallback si Xbox échoue)
 */
export async function getMicrosoftProfile(accessToken) {
  try {
    const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    return {
      displayName: response.data.displayName,
      email: response.data.mail || response.data.userPrincipalName,
      id: response.data.id
    };
  } catch (error) {
    console.error('Microsoft Graph error:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Obtient le profil Xbox Live d'un utilisateur
 */
export async function getXboxProfile(xstsToken, userHash) {
  try {
    const response = await axios.get(URLS.profile, {
      params: {
        settings: 'Gamertag,GameDisplayPicRaw,Gamerscore,AccountTier'
      },
      headers: {
        'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
        'x-xbl-contract-version': '2'
      }
    });

    const settings = response.data.profileUsers[0].settings;
    const profile = {};

    settings.forEach(setting => {
      profile[setting.id] = setting.value;
    });

    return profile;
  } catch (error) {
    console.error('Xbox profile error:', error.response?.data || error.message);
    throw new Error('Impossible de récupérer le profil Xbox');
  }
}

/**
 * Recherche un gamertag Xbox
 */
export async function searchGamertag(gamertag, xstsToken, userHash) {
  try {
    const response = await axios.get(
      `https://profile.xboxlive.com/users/gt(${encodeURIComponent(gamertag)})/profile/settings`,
      {
        params: {
          settings: 'Gamertag,GameDisplayPicRaw,Gamerscore'
        },
        headers: {
          'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
          'x-xbl-contract-version': '2'
        }
      }
    );

    if (response.data.profileUsers && response.data.profileUsers.length > 0) {
      const settings = response.data.profileUsers[0].settings;
      const profile = { xuid: response.data.profileUsers[0].id };

      settings.forEach(setting => {
        profile[setting.id] = setting.value;
      });

      return profile;
    }

    return null;
  } catch (error) {
    console.error('Xbox search error:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Obtient l'activité récente d'un joueur (jeux joués)
 */
export async function getRecentActivity(xuid, xstsToken, userHash) {
  try {
    const response = await axios.get(
      `https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/detail`,
      {
        headers: {
          'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
          'x-xbl-contract-version': '2'
        }
      }
    );

    return response.data.titles || [];
  } catch (error) {
    console.error('Xbox activity error:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Obtient le statut de présence d'un joueur (en ligne, hors ligne, en jeu)
 */
export async function getPresence(xuid, xstsToken, userHash) {
  try {
    const response = await axios.get(
      `https://userpresence.xboxlive.com/users/xuid(${xuid})`,
      {
        headers: {
          'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
          'x-xbl-contract-version': '3'
        }
      }
    );

    const data = response.data;

    return {
      isOnline: data.state === 'Online',
      state: data.state, // Online, Offline, Away
      lastSeen: data.lastSeen?.dateTime,
      devices: data.devices?.map(device => ({
        type: device.type, // XboxOne, WindowsOneCore, etc.
        titles: device.titles?.map(title => ({
          id: title.id,
          name: title.name,
          placement: title.placement, // Full, Background, etc.
          state: title.state // Active, Inactive
        }))
      })) || []
    };
  } catch (error) {
    console.error('Xbox presence error:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Obtient le statut de présence de plusieurs joueurs
 */
export async function getBatchPresence(xuids, xstsToken, userHash) {
  try {
    const response = await axios.post(
      'https://userpresence.xboxlive.com/users/batch',
      {
        users: xuids.map(xuid => ({ xuid })),
        level: 'all'
      },
      {
        headers: {
          'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
          'x-xbl-contract-version': '3',
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.map(user => ({
      xuid: user.xuid,
      isOnline: user.state === 'Online',
      state: user.state,
      currentGame: user.devices?.[0]?.titles?.find(t => t.placement === 'Full')?.name || null
    }));
  } catch (error) {
    console.error('Xbox batch presence error:', error.response?.data || error.message);
    return [];
  }
}

export default {
  getAuthorizationUrl,
  exchangeCodeForToken,
  authenticateWithXboxLive,
  getXboxProfile,
  searchGamertag,
  getRecentActivity,
  getPresence,
  getBatchPresence
};
