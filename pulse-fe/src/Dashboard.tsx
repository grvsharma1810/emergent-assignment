import { useState, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3000';

export const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user data from the authenticated API
    const fetchUser = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/user`, {
          credentials: 'include', // Important: includes cookies in the request
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const data = await response.json();
        setUser(data.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleSignOut = () => {
    window.location.href = `${BACKEND_URL}/logout`;
  };

  if (loading) {
    return (
      <div className="App">
        <h1>Loading...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={() => window.location.href = '/'}>Go back</button>
      </div>
    );
  }

  return (
    <div className="App">
      <h1>Authentication Success! 🎉</h1>
      <p>Welcome to your dashboard</p>

      {user && (
        <div style={{ marginTop: '2rem' }}>
          <h2>User Information</h2>
          <div style={{
            background: 'black',
            padding: '1rem',
            borderRadius: '8px',
            textAlign: 'left',
            maxWidth: '500px',
            margin: '1rem auto'
          }}>
            <p><strong>User ID:</strong> {user.id}</p>
            {user.email && <p><strong>Email:</strong> {user.email}</p>}
            {user.firstName && <p><strong>First Name:</strong> {user.firstName}</p>}
            {user.lastName && <p><strong>Last Name:</strong> {user.lastName}</p>}
          </div>
        </div>
      )}

      <p style={{ marginTop: '2rem' }}>
        <button onClick={handleSignOut}>Sign out</button>
      </p>
    </div>
  );
};
