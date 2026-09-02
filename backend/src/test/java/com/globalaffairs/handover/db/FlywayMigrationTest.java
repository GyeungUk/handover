package com.globalaffairs.handover.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.globalaffairs.handover.member.RemovedMember;
import com.globalaffairs.handover.member.RemovedMemberRepository;
import com.globalaffairs.handover.schedule.TaskReschedule;
import com.globalaffairs.handover.schedule.TaskRescheduleRepository;
import java.time.Instant;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Runs the Flyway migrations against a real PostgreSQL and checks the schema they produce is the one
 * the entities are mapped against — including the identity column that replaced SQLite's
 * {@code AUTOINCREMENT}.
 *
 * <p>Needs a working Docker daemon. Without one the whole class is skipped rather than failed, so a
 * machine with no Docker can still run the rest of the suite; see the README.
 */
@SpringBootTest
@Testcontainers
@EnabledIf("dockerAvailable")
class FlywayMigrationTest {

    @Container
    @SuppressWarnings("resource")
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("handover")
            .withUsername("handover")
            .withPassword("handover");

    static boolean dockerAvailable() {
        try {
            return org.testcontainers.DockerClientFactory.instance().isDockerAvailable();
        } catch (RuntimeException unavailable) {
            return false;
        }
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private DataSource dataSource;

    @Autowired
    private RemovedMemberRepository removedMembers;

    @Autowired
    private TaskRescheduleRepository reschedules;

    @Test
    void appliesEveryMigrationOnce() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        List<String> applied = jdbc.queryForList(
                "SELECT script FROM flyway_schema_history WHERE success ORDER BY installed_rank", String.class);

        assertThat(applied).containsExactly(
                "V1__removed_members.sql", "V2__task_reschedules.sql", "V3__handover_documents.sql",
                "V4__accounts.sql", "V5__org_management.sql", "V6__task_checklists.sql",
                "V7__account_onboarding_members.sql", "V8__custom_tasks.sql",
                "V9__removed_tasks.sql", "V10__task_dates.sql", "V11__task_periods.sql",
                "V12__bundle_previous_comment.sql");
    }

    @Test
    void createsEveryTableWithTheIndexesTheQueriesRelyOn() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        assertThat(jdbc.queryForList(
                        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'", String.class))
                .contains(
                        "removed_members",
                        "task_reschedules",
                        "handover_documents",
                        "handover_entries",
                        "handover_bundles",
                        "accounts",
                        "account_sessions",
                        "password_reset_tokens",
                        "custom_teams",
                        "custom_members",
                        "task_checklist_items",
                        "custom_tasks",
                        "removed_tasks",
                        "task_dates",
                        "task_periods");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'task_reschedules'", String.class))
                .contains("task_reschedules_pkey", "task_reschedules_task_key_idx", "task_reschedules_person_id_idx");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'handover_entries'", String.class))
                .contains("handover_entries_owner_idx", "handover_entries_owner_entry_key");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'task_checklist_items'", String.class))
                .contains(
                        "task_checklist_items_pkey",
                        "task_checklist_items_task_item_key");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'custom_members'", String.class))
                .contains("custom_members_pkey", "custom_members_employee_id_key");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'custom_tasks'", String.class))
                .contains("custom_tasks_pkey", "custom_tasks_person_title_key", "custom_tasks_person_id_idx");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'removed_tasks'", String.class))
                .contains("removed_tasks_pkey", "removed_tasks_person_id_idx");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'task_dates'", String.class))
                .contains("task_dates_pkey", "task_dates_task_key_date_key", "task_dates_person_id_idx");
        assertThat(jdbc.queryForList(
                        "SELECT indexname FROM pg_indexes WHERE tablename = 'task_periods'", String.class))
                .contains("task_periods_pkey", "task_periods_person_id_idx");
    }

    @Test
    void keepsEntryIdsUniqueWithinOneDocument() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("""
                INSERT INTO handover_documents (owner_email, owner_name, status, updated_at)
                VALUES ('unique@example.com', '김지현', 'draft', now())
                """);
        jdbc.update("""
                INSERT INTO handover_entries
                  (owner_email, entry_id, position, category, title, detail, properties, attachments,
                   font_family, font_size)
                VALUES ('unique@example.com', 'r1', 0, 'responsibility', '체류 관리', '<p>본문</p>', '{}', '[]',
                        'Pretendard', '16')
                """);

        assertThatThrownBy(() -> jdbc.update("""
                        INSERT INTO handover_entries
                          (owner_email, entry_id, position, category, title, detail, properties, attachments,
                           font_family, font_size)
                        VALUES ('unique@example.com', 'r1', 1, 'plan', '중복', '<p>본문</p>', '{}', '[]',
                                'Pretendard', '16')
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletesAnAccountsEntriesAndUnitsWithItsDocument() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("""
                INSERT INTO handover_documents (owner_email, owner_name, status, updated_at)
                VALUES ('cascade@example.com', '김지현', 'draft', now())
                """);
        jdbc.update("""
                INSERT INTO handover_bundles
                  (owner_email, bundle_id, position, title, entry_ids, decision, comment)
                VALUES ('cascade@example.com', 'b1', 0, '체류·비자', '[]', NULL, '')
                """);

        jdbc.update("DELETE FROM handover_documents WHERE owner_email = 'cascade@example.com'");

        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM handover_bundles WHERE owner_email = 'cascade@example.com'",
                        Integer.class))
                .isZero();
    }

    @Test
    void refusesAnEmployeeNumberThatIsNotAllDigits() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        assertThatThrownBy(() -> jdbc.update("""
                        INSERT INTO accounts (employee_id, name, email, password_hash, created_at, updated_at)
                        VALUES ('a20190002', '김지현', 'letters@example.com', 'x', now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletesAnAccountsSessionsAndResetCodesWithIt() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("""
                INSERT INTO accounts (employee_id, name, email, password_hash, created_at, updated_at)
                VALUES ('20190009', '김지현', 'cascade-account@example.com', 'x', now(), now())
                """);
        jdbc.update("""
                INSERT INTO account_sessions (token_hash, employee_id, created_at, expires_at)
                VALUES ('deadbeef', '20190009', now(), now() + interval '1 day')
                """);
        jdbc.update("""
                INSERT INTO password_reset_tokens (token_hash, employee_id, created_at, expires_at)
                VALUES ('cafebabe', '20190009', now(), now() + interval '10 minutes')
                """);

        jdbc.update("DELETE FROM accounts WHERE employee_id = '20190009'");

        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM account_sessions WHERE employee_id = '20190009'", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM password_reset_tokens WHERE employee_id = '20190009'", Integer.class))
                .isZero();
    }

    @Test
    void refusesAStatusThatIsNotOneOfTheFourWorkflowStates() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        assertThatThrownBy(() -> jdbc.update("""
                        INSERT INTO handover_documents (owner_email, owner_name, status, updated_at)
                        VALUES ('bogus@example.com', '김지현', 'archived', now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void generatesIdsWithoutOneBeingSuppliedTheWayAutoincrementDid() {
        TaskReschedule first = reschedules.save(new TaskReschedule(
                "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                21, 23, "사유", "박민서", Instant.parse("2026-08-29T01:02:03.456Z")));
        TaskReschedule second = reschedules.save(new TaskReschedule(
                "minseo::비자 연장 집중기간", "minseo", "비자 연장 집중기간",
                23, 25, "사유", "박민서", Instant.parse("2026-08-29T01:02:04.456Z")));

        assertThat(first.getId()).isNotNull();
        assertThat(second.getId()).isGreaterThan(first.getId());
        assertThat(reschedules.findFirstByTaskKeyOrderByIdDesc("minseo::비자 연장 집중기간"))
                .get()
                .extracting(TaskReschedule::getToStart)
                .isEqualTo(25);
    }

    @Test
    void acceptsAnExplicitIdSoAD1ImportCanKeepItsOwnOrdering() {
        /* GENERATED BY DEFAULT, not ALWAYS: the import in docs/MIGRATION-FROM-D1.md depends on this. */
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("""
                INSERT INTO task_reschedules
                  (id, task_key, person_id, task_title, from_start, to_start, reason, changed_by, changed_at)
                VALUES (9001, 'jiwoo::상반기 정기상담', 'jiwoo', '상반기 정기상담', 8, 10, '가져온 기록', '최지우', now())
                """);

        assertThat(jdbc.queryForObject(
                        "SELECT reason FROM task_reschedules WHERE id = 9001", String.class))
                .isEqualTo("가져온 기록");
    }

    @Test
    void roundTripsATimestampWithoutLosingTheMillisecondsTheFrontendSees() {
        Instant changedAt = Instant.parse("2026-08-29T01:02:03.456Z");
        TaskReschedule saved = reschedules.save(new TaskReschedule(
                "dohyun::외국인 장학 선발", "dohyun", "외국인 장학 선발", 4, 6, "사유", "이도현", changedAt));

        assertThat(reschedules.findById(saved.getId()))
                .get()
                .extracting(TaskReschedule::getChangedAt)
                .isEqualTo(changedAt);
    }

    @Test
    void keepsPersonIdUniqueInRemovedMembers() {
        removedMembers.save(new RemovedMember("nayeon", Instant.now()));

        assertThatThrownBy(() -> new JdbcTemplate(dataSource).update(
                        "INSERT INTO removed_members (person_id, removed_at) VALUES ('nayeon', now())"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
