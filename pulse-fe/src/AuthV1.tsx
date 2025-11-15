import { useAuth, AuthKitProvider } from "@workos-inc/authkit-react";
import React, { useEffect, useState, type JSX } from "react";

export function Auth() {
  const { isLoading, user, getAccessToken, signIn, signUp, signOut } =
    useAuth();

  // This `/login` endpoint should be registered as the login endpoint on
  // the "Redirects" page of the WorkOS Dashboard. In a real app, this code would
  // live in a route instead of in the main <App/> component
  React.useEffect(() => {
    if (window.location.pathname === "/login") {
      // Redirects to the signIn page
      signIn();
    }
  }, [window.location, signIn]);

  // isLoading is true until WorkOS has determined the user's authentication status
  if (isLoading) {
    return <p>... insert cool spinner here ...</p>;
  }

  // If user doesn't exist, then the user is signed out
  if (!user) {
    return (
      <>
        <button
          onClick={() => {
            // Redirects to the signIn page
            signIn();
          }}
        >
          Sign in
        </button>
        <button
          onClick={() => {
            // Redirects to the signUp page
            signUp();
          }}
        >
          Sign up
        </button>
      </>
    );
  }

  // Show the logged in view
  return (
    <>
      <p>Welcome back{user.firstName && `, ${user.firstName}`}</p>
      <p>
        <button
          onClick={async () => {
            // getAccessToken will return an existing (unexpired) access token, or
            // obtain a fresh one if necessary
            const accessToken = await getAccessToken();
            console.log(`Making API request with ${accessToken}`);
          }}
        >
          Make API Request
        </button>
      </p>
      <p>
        <button
          onClick={() => {
            signOut();
          }}
        >
          Sign Out
        </button>
      </p>
    </>
  );
}

function AppV1(): JSX.Element {
  const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID;

  if (!clientId) {
    return (
      <div className="loading-container">
        <div className="error">
          <h1>Configuration Error</h1>
          <p>
            Missing VITE_WORKOS_CLIENT_ID environment variable.
            <br />
            Please check your .env file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthKitProvider
      devMode={true}
      clientId="client_01KA32XKNNQ65WTEB00XYTZG8W"
      apiHostname="localhost:3000"
    >
      <Auth />
    </AuthKitProvider>
  );
}
