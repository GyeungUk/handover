package com.globalaffairs.handover.account;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

/**
 * Password storage: PBKDF2-HMAC-SHA256, salted per account.
 *
 * <p>PBKDF2 rather than bcrypt or argon2 because it is in the JDK — this backend has no Spring
 * Security on the classpath, and a password hash is not worth a dependency whose only other use
 * would be to bring in a filter chain we do not want.
 *
 * <p>The iteration count is stored inside the hash string, so raising it later re-hashes accounts as
 * they sign in instead of locking everyone out. {@link #needsRehash} is what tells the service to.
 */
@Component
public class PasswordHasher {

    /** OWASP's 2023 floor for PBKDF2-HMAC-SHA256. */
    static final int ITERATIONS = 210_000;

    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final String PREFIX = "pbkdf2-sha256";
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;

    private final SecureRandom random = new SecureRandom();
    private final int iterations;

    public PasswordHasher() {
        this(ITERATIONS);
    }

    /** Tests use a small count; nothing else should. */
    PasswordHasher(int iterations) {
        this.iterations = iterations;
    }

    /** {@code pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>} */
    public String hash(String password) {
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        byte[] key = derive(password, salt, iterations);
        Base64.Encoder encoder = Base64.getEncoder().withoutPadding();
        return PREFIX + "$" + iterations + "$" + encoder.encodeToString(salt) + "$" + encoder.encodeToString(key);
    }

    /** Constant-time comparison; a malformed or unknown stored value simply fails to match. */
    public boolean matches(String password, String stored) {
        Parsed parsed = parse(stored);
        if (parsed == null) {
            return false;
        }
        byte[] candidate = derive(password, parsed.salt(), parsed.iterations());
        return MessageDigest.isEqual(candidate, parsed.key());
    }

    /** True when the stored hash was made with fewer rounds than we now use. */
    public boolean needsRehash(String stored) {
        Parsed parsed = parse(stored);
        return parsed == null || parsed.iterations() < iterations;
    }

    /**
     * The one-way value stored for session and reset tokens. The token itself only ever exists in the
     * cookie or the email, so a leaked table row cannot be replayed as a login.
     */
    public static String tokenDigest(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required of every JVM", impossible);
        }
    }

    private record Parsed(int iterations, byte[] salt, byte[] key) {}

    private static Parsed parse(String stored) {
        if (stored == null) {
            return null;
        }
        String[] parts = stored.split("\\$");
        if (parts.length != 4 || !PREFIX.equals(parts[0])) {
            return null;
        }
        try {
            Base64.Decoder decoder = Base64.getDecoder();
            return new Parsed(Integer.parseInt(parts[1]), decoder.decode(parts[2]), decoder.decode(parts[3]));
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }

    private static byte[] derive(String password, byte[] salt, int iterations) {
        try {
            return SecretKeyFactory.getInstance(ALGORITHM)
                    .generateSecret(new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BITS))
                    .getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException failure) {
            throw new IllegalStateException("PBKDF2 is required of every JVM", failure);
        }
    }
}
