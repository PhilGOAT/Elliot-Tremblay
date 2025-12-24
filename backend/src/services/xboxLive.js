import axios from 'axios';

// Configuration Xbox Live API
const XBOX_CONFIG = {
  clientId: process.env.XBOX_CLIENT_ID,
  clientSecret: process.env.XBOX_CLIENT_SECRET,
  redirectUri: process.env.XBOX_REDIRECT_URI || 'http://localhost:5173/auth/xbox/callback',
  scopes: 'XboxLive.signin XboxLive.offline_access'
};

// URLs Microsoft/Xbox
const URLS = {
  authorize: 'https://login.live.com/oauth20_authorize.srf',
  token: 'https://login.live.com/oauth20_token.srf',
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
    state: state
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

    // Étape 2: Obtenir le token XSTS
    const xstsResponse = await axios.post(URLS.xstsAuth, {
      RelyingParty: 'http://xboxlive.com',
      TokenType: 'JWT',
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xblToken]
      }
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const xstsToken = xstsResponse.data.Token;
    const xuid = xstsResponse.data.DisplayClaims.xui[0].xid;
    const gamertag = xstsResponse.data.DisplayClaims.xui[0].gtg;

    return {
      xstsToken,
      userHash,
      xuid,
      gamertag
    };
  } catch (error) {
    console.error('Xbox Live auth error:', error.response?.data || error.message);
    throw new Error('Échec de l\'authentification Xbox Live');
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

export default {
  getAuthorizationUrl,
  exchangeCodeForToken,
  authenticateWithXboxLive,
  getXboxProfile,
  searchGamertag,
  getRecentActivity
};
