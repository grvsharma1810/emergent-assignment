const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const AppV2 = () => {
  const handleSignIn = () => {
    window.location.href = `${BACKEND_URL}/login`;
  };

  const handleSignOut = () => {
    window.location.href = `${BACKEND_URL}/logout`;
  };

  return (
    <div className="App">
      <h1>AuthKit example</h1>
      <p>This is an example of how to use AuthKit with a React frontend.</p>
      <p>
        <button onClick={handleSignIn}>Sign in</button>
      </p>
      <p>
        <button onClick={handleSignOut}>Sign out</button>
      </p>
    </div>
  );
};
