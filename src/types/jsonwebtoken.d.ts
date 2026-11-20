// src/types/jsonwebtoken.d.ts
declare module 'jsonwebtoken' {
  interface JwtPayload {
    sub: string;
    role: string;
    iat?: number;
    exp?: number;
  }
  function sign(payload: object | string, secretOrPrivateKey: string, options?: any): string;
  function verify(token: string, secretOrPublicKey: string, options?: any): JwtPayload;
}

