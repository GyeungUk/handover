package com.globalaffairs.handover;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/** The Spring Boot replacement for the Next.js route handlers that ran on Cloudflare Workers. */
@SpringBootApplication
@ConfigurationPropertiesScan
public class HandoverApplication {

    public static void main(String[] args) {
        SpringApplication.run(HandoverApplication.class, args);
    }
}
